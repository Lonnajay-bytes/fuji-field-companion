
'use strict';

const $ = (id) => document.getElementById(id);
const $$ = (selector, root=document) => [...root.querySelectorAll(selector)];
const KEY = 'fujiField:';
const store = {
  get(name, fallback){
    try { const raw=localStorage.getItem(KEY+name); return raw===null?fallback:JSON.parse(raw); }
    catch { return fallback; }
  },
  set(name, value){ localStorage.setItem(KEY+name, JSON.stringify(value)); },
  remove(name){ localStorage.removeItem(KEY+name); }
};
const state = {
  recipes: [], custom: store.get('customRecipes', []), favorites: store.get('favorites', null),
  compare: [], visible: 24, weather: store.get('weather', null), deferredInstall: null,
  map: null, mapMarkers: []
};

function allRecipes(){ return [...state.recipes, ...state.custom]; }
function getRecipe(id){ return allRecipes().find(r => String(r.id)===String(id)); }
function fmtSigned(v){ return `${Number(v)>=0?'+':''}${v}`; }
function escapeHTML(value=''){ return String(value).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])); }
function showToast(message){
  const t=$('toast'); t.textContent=message; t.classList.add('show');
  clearTimeout(showToast.timer); showToast.timer=setTimeout(()=>t.classList.remove('show'),2600);
}
function downloadJSON(data, filename){
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url;a.download=filename;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function route(id){
  $$('.view').forEach(v=>v.classList.toggle('active',v.id===id));
  $$('#mainNav button').forEach(b=>b.classList.toggle('active',b.dataset.route===id));
  $('mainNav').classList.remove('open'); window.scrollTo({top:0,behavior:'smooth'});
  if(id==='library') renderLibrary();
  if(id==='slots') renderSlots();
  if(id==='builder') updateBuilder();
  if(id==='guide') renderGuide();
  if(id==='planner') renderPlanner();
  if(id==='journal') renderJournal();
  if(id==='tools') { renderTools(); setTimeout(initMap,250); }
}
$$('[data-route]').forEach(b=>b.addEventListener('click',()=>route(b.dataset.route)));
$('menuBtn').addEventListener('click',()=>$('mainNav').classList.toggle('open'));

function weatherLabel(code){
  if(code===0) return 'Clear';
  if([1,2].includes(code)) return 'Partly cloudy';
  if(code===3) return 'Overcast';
  if([45,48].includes(code)) return 'Fog';
  if(code>=51&&code<=67) return 'Rain';
  if(code>=71&&code<=77) return 'Snow';
  if(code>=80&&code<=82) return 'Showers';
  if(code>=95) return 'Thunderstorms';
  return 'Mixed weather';
}
function weatherCondition(data){
  const c=data.current||{};
  if(c.is_day===0) return 'Low light';
  if(c.weather_code>=51) return 'Rain';
  if(c.cloud_cover>=75) return 'Cloudy';
  if(c.cloud_cover>=35) return 'Mixed';
  return 'Sunny';
}
function localTimeCategory(data){
  const now=new Date();
  const sunrise=new Date(data.daily.sunrise[0]);
  const sunset=new Date(data.daily.sunset[0]);
  const ms=now.getTime();
  if(Math.abs(ms-sunrise.getTime())<50*60000) return 'Golden hour';
  if(Math.abs(ms-sunset.getTime())<60*60000) return 'Golden hour';
  if(ms>sunset.getTime()+10*60000 || ms<sunrise.getTime()-25*60000) return 'Night';
  return now.getHours()<12?'Morning':'Afternoon';
}
function scoreRecipe(r, criteria){
  let n=28, reasons=[];
  const tags=(r.tags||[]).map(x=>String(x).toLowerCase());
  if(tags.includes(criteria.subject)){ n+=24; reasons.push(criteria.subject); }
  if((r.times||[]).some(t=>t.toLowerCase()===criteria.time.toLowerCase()) || criteria.time==='Any'){ n+=13; reasons.push(criteria.time); }
  if((r.weather||[]).some(w=>w.toLowerCase()===criteria.weather.toLowerCase())){ n+=12; reasons.push(criteria.weather); }
  if(r.mood===criteria.mood || tags.includes(criteria.mood)){ n+=12; reasons.push(criteria.mood); }
  if(criteria.filter==='Black Mist 1/8'){
    if(r.filter.includes('Black Mist')){n+=10;reasons.push('Black Mist');}
    else if(r.filter==='Works either way') n+=5;
  } else if(!r.filter.includes('Best with')) n+=8;
  if(criteria.focal==='Any'||r.focal===criteria.focal) n+=6;
  if(r.rating) n+=(r.rating-8)*2;
  return {score:Math.min(99,Math.round(n)),reasons};
}
function topMatches(criteria,count=5){
  return allRecipes().map(r=>({r,...scoreRecipe(r,criteria)})).sort((a,b)=>b.score-a.score||b.r.rating-a.r.rating).slice(0,count);
}

function recipeCard(r, score=null){
  const favorite=state.favorites?.includes(String(r.id));
  const mist=r.filter?.includes('Black Mist');
  return `<article class="recipe-card" data-id="${escapeHTML(r.id)}">
    <div class="recipe-image"><img loading="lazy" src="${r.image}" alt="${escapeHTML(r.name)} processed recipe preview">
      ${score!==null?`<span class="match-score">${score}% match</span>`:''}</div>
    <div class="recipe-body">
      <div class="recipe-kicker"><span>${escapeHTML(r.collection)}</span><span>★ ${r.rating||'—'}</span></div>
      <h3>${escapeHTML(r.name)}</h3>
      <p>${escapeHTML(r.simulation)} · ${escapeHTML(r.focal)} · ${escapeHTML(r.times?.[0]||'Any')}</p>
      <div class="pills"><span class="pill ${mist?'mist':''}">${escapeHTML(r.filter)}</span><span class="pill">${escapeHTML(r.mood)}</span></div>
      <div class="card-actions">
        <button data-action="details" data-id="${escapeHTML(r.id)}">Settings</button>
        <button data-action="compare" data-id="${escapeHTML(r.id)}">Compare</button>
        <button class="favorite ${favorite?'active':''}" data-action="favorite" data-id="${escapeHTML(r.id)}" aria-label="Favorite">♥</button>
      </div>
    </div>
  </article>`;
}
document.addEventListener('click',(e)=>{
  const btn=e.target.closest('[data-action]');
  if(!btn) return;
  const id=btn.dataset.id, action=btn.dataset.action;
  if(action==='details') openRecipe(id);
  if(action==='favorite') toggleFavorite(id);
  if(action==='compare') toggleCompare(id);
});

function toggleFavorite(id){
  const s=String(id);
  state.favorites=state.favorites||[];
  state.favorites=state.favorites.includes(s)?state.favorites.filter(x=>x!==s):[...state.favorites,s];
  store.set('favorites',state.favorites); renderLibrary(); renderFinderIfVisible(); showToast(state.favorites.includes(s)?'Added to favorites':'Removed from favorites');
}
function toggleCompare(id){
  const s=String(id);
  state.compare=state.compare.includes(s)?state.compare.filter(x=>x!==s):(state.compare.length<3?[...state.compare,s]:state.compare);
  updateCompareTray();
  if(state.compare.length===3&&!state.compare.includes(s)) showToast('Compare is limited to three recipes.');
}
function updateCompareTray(){
  $('compareNames').textContent=state.compare.map(id=>getRecipe(id)?.name).filter(Boolean).join(' • ');
  $('compareTray').classList.toggle('show',state.compare.length>0);
}
$('clearCompare').addEventListener('click',()=>{state.compare=[];updateCompareTray();});
$('openCompare').addEventListener('click',()=>{
  if(state.compare.length<2){showToast('Choose at least two recipes.');return;}
  const rs=state.compare.map(getRecipe).filter(Boolean);
  const rows=[
    ['Preview','image'],['Simulation','simulation'],['Dynamic Range','dr'],['White Balance','wb'],
    ['WB Shift','shift'],['Highlight','highlight'],['Shadow','shadow'],['Color','color'],['Sharpness','sharpness'],
    ['High ISO NR','nr'],['Grain','grain'],['Color Chrome FX','cc'],['FX Blue','ccblue'],['Clarity','clarity'],['Filter','filter'],['Focal','focal']
  ];
  $('modalContent').innerHTML=`<div class="modal-body"><h2 id="modalTitle">Recipe comparison</h2><div style="overflow:auto"><table class="compare-table">
  <tr><th>Setting</th>${rs.map(r=>`<th>${escapeHTML(r.name)}</th>`).join('')}</tr>
  ${rows.map(([label,key])=>`<tr><td><b>${label}</b></td>${rs.map(r=>{
    if(key==='image') return `<td><img src="${r.image}" alt=""></td>`;
    if(key==='shift') return `<td>R ${fmtSigned(r.r)}, B ${fmtSigned(r.b)}</td>`;
    return `<td>${escapeHTML(r[key])}</td>`;
  }).join('')}</tr>`).join('')}</table></div></div>`;
  openModal();
});

function openModal(){ $('recipeModal').classList.add('show'); document.body.classList.add('modal-open'); }
function closeModal(){ $('recipeModal').classList.remove('show'); document.body.classList.remove('modal-open'); }
$('closeModal').addEventListener('click',closeModal);
$('recipeModal').addEventListener('click',e=>{if(e.target===$('recipeModal')) closeModal();});
document.addEventListener('keydown',e=>{if(e.key==='Escape') closeModal();});

function settingsGrid(r){
  const data=[
    ['Film Simulation',r.simulation],['Dynamic Range',r.dr],['White Balance',r.wb],
    ['WB Shift',`R ${fmtSigned(r.r)}, B ${fmtSigned(r.b)}`],['Highlight',fmtSigned(r.highlight)],['Shadow',fmtSigned(r.shadow)],
    ['Color',fmtSigned(r.color)],['Sharpness',fmtSigned(r.sharpness)],['High ISO NR',fmtSigned(r.nr)],
    ['Grain',r.grain],['Color Chrome FX',r.cc],['Color Chrome FX Blue',r.ccblue],
    ['Clarity',fmtSigned(r.clarity)],['Exposure starting point',r.exp],['Suggested focal length',r.focal],['Suggested aperture',r.aperture]
  ];
  return data.map(([a,b])=>`<div class="setting"><small>${escapeHTML(a)}</small><b>${escapeHTML(b)}</b></div>`).join('');
}
function openRecipe(id){
  const r=getRecipe(id); if(!r) return;
  const notes=store.get('notes',{}); const note=notes[String(id)]||'';
  const isMist=r.previewIncludesMist;
  $('modalContent').innerHTML=`<div class="modal-hero">
    <img id="modalPreviewImage" src="${r.image}" alt="${escapeHTML(r.name)} recipe preview">
    <span class="preview-label">${isMist?'Processed preview with simulated 1/8 diffusion':'Processed preview approximating the recipe'}</span>
  </div>
  <div class="modal-body">
    <p class="eyebrow">${escapeHTML(r.collection)}</p><h2 id="modalTitle">${escapeHTML(r.name)}</h2>
    <p>${escapeHTML(r.description)}</p>
    <div class="pills"><span class="pill ${r.filter.includes('Black Mist')?'mist':''}">${escapeHTML(r.filter)}</span><span class="pill">${escapeHTML(r.focal)}</span><span class="pill">${escapeHTML(r.weather.join(' · '))}</span></div>
    <div class="button-row"><button id="toggleSourceBtn" class="secondary">Show ungraded source</button><button id="copySettingsBtn" class="secondary">Copy settings</button></div>
    <div class="modal-columns section-gap">
      <div><h3>Camera checklist</h3><div class="settings-grid">${settingsGrid(r)}</div></div>
      <div>
        <h3>Use it well</h3><p><b>Best subjects:</b> ${escapeHTML((r.tags||[]).slice(0,5).join(', '))}</p>
        <p><b>Best light:</b> ${escapeHTML((r.times||[]).join(', '))}</p>
        <p><b>Lens guidance:</b> On your XF 16–80mm, start around ${escapeHTML(r.focal)}. ${r.focal.startsWith('16')?'Use it for context and leading lines.':'Use it to simplify the frame and compress the background.'}</p>
        <div class="callout"><b>Preview note:</b> the image is a processed approximation. Your JPEG will still change with light, exposure, subject color, and white balance.</div>
        <label class="modal-note">Your notes<textarea id="recipeNotes">${escapeHTML(note)}</textarea></label>
        <button id="saveRecipeNote" class="primary">Save note</button>
        <label style="margin-top:12px">Assign to a custom bank<select id="modalSlotSelect"><option value="">Choose C-slot</option>${[1,2,3,4,5,6,7].map(n=>`<option value="${n}">C${n}</option>`).join('')}</select></label>
      </div>
    </div>
  </div>`;
  openModal();
  let original=false;
  $('toggleSourceBtn').onclick=()=>{
    original=!original; $('modalPreviewImage').src=original?r.sourceImage:r.image;
    $('toggleSourceBtn').textContent=original?'Show graded preview':'Show ungraded source';
  };
  $('copySettingsBtn').onclick=async()=>{
    const text=`${r.name}\nFilm Simulation: ${r.simulation}\nDynamic Range: ${r.dr}\nWhite Balance: ${r.wb}\nWB Shift: R ${fmtSigned(r.r)}, B ${fmtSigned(r.b)}\nHighlight: ${fmtSigned(r.highlight)}\nShadow: ${fmtSigned(r.shadow)}\nColor: ${fmtSigned(r.color)}\nSharpness: ${fmtSigned(r.sharpness)}\nHigh ISO NR: ${fmtSigned(r.nr)}\nGrain: ${r.grain}\nColor Chrome FX: ${r.cc}\nColor Chrome FX Blue: ${r.ccblue}\nClarity: ${fmtSigned(r.clarity)}`;
    try{await navigator.clipboard.writeText(text);showToast('Settings copied.');}catch{showToast('Copy was blocked by the browser.');}
  };
  $('saveRecipeNote').onclick=()=>{notes[String(id)]=$('recipeNotes').value;store.set('notes',notes);showToast('Recipe note saved.');};
  $('modalSlotSelect').onchange=()=>{
    const n=$('modalSlotSelect').value;if(!n)return;
    const slots=store.get('slots',defaultSlots()); slots[n-1]=String(id);store.set('slots',slots);showToast(`${r.name} assigned to C${n}.`);
  };
}

function renderCollections(){
  const collectionMap=[...new Map(state.recipes.map(r=>[r.collectionSlug,{title:r.collection,slug:r.collectionSlug,image:r.image,description:r.description}])).values()];
  $('collectionCards').innerHTML=collectionMap.map(c=>`<button class="collection-card" data-collection="${c.slug}"><img loading="lazy" src="${c.image}" alt=""><div><h3>${escapeHTML(c.title)}</h3><span>10 recipes · graded previews</span></div></button>`).join('');
  $$('.collection-card').forEach(b=>b.onclick=()=>{route('library');$('collectionFilter').value=b.dataset.collection;state.visible=24;renderLibrary();});
  $('collectionFilter').innerHTML='<option value="">All collections</option>'+collectionMap.map(c=>`<option value="${c.slug}">${escapeHTML(c.title)}</option>`).join('');
  $('builderScene').innerHTML=collectionMap.map(c=>`<option value="assets/sources/${c.slug}.jpg">${escapeHTML(c.title)}</option>`).join('');
}
function renderHome(){
  const permanent=['everyday-01','golden-03','documentary-01','beach-01','monochrome-01'].map(slug=>state.recipes.find(r=>r.slug===slug)).filter(Boolean);
  $('homePermanent').innerHTML=permanent.map((r,i)=>`<button class="mini-recipe text-button" data-home-recipe="${r.id}"><img src="${r.image}" alt=""><span><b>C${i+1} · ${escapeHTML(r.name)}</b><small>${escapeHTML(r.simulation)}</small></span><span>→</span></button>`).join('');
  $$('[data-home-recipe]').forEach(b=>b.onclick=()=>openRecipe(b.dataset.homeRecipe));
  renderCollections();
  if(state.weather) renderWeatherState(state.weather);
}

function filteredRecipes(){
  const q=$('recipeSearch').value.trim().toLowerCase(), c=$('collectionFilter').value, mist=$('mistFilter').value, view=$('libraryView').value;
  let list=allRecipes().filter(r=>{
    const hay=JSON.stringify(r).toLowerCase();
    return (!q||hay.includes(q))&&(!c||r.collectionSlug===c)&&(!mist||r.filter===mist)
      &&(view==='all'||(view==='favorites'&&state.favorites?.includes(String(r.id)))||(view==='custom'&&String(r.id).startsWith('custom-')));
  });
  const sort=$('sortRecipes').value;
  if(sort==='name') list.sort((a,b)=>a.name.localeCompare(b.name));
  else if(sort==='rating') list.sort((a,b)=>(b.rating||0)-(a.rating||0));
  else if(sort==='collection') list.sort((a,b)=>a.collection.localeCompare(b.collection)||a.name.localeCompare(b.name));
  else list.sort((a,b)=>(b.favoriteDefault?1:0)-(a.favoriteDefault?1:0)||a.id-b.id);
  return list;
}
function renderLibrary(){
  if(!$('recipeGrid'))return;
  const list=filteredRecipes();
  $('recipeGrid').innerHTML=list.slice(0,state.visible).map(r=>recipeCard(r)).join('')||'<div class="empty-state">No recipes match those filters.</div>';
  $('showMoreRecipes').classList.toggle('hidden',state.visible>=list.length);
  const c=$('collectionFilter').value;
  if(c){
    const first=state.recipes.find(r=>r.collectionSlug===c);
    $('activeCollectionBanner').classList.remove('hidden');
    $('activeCollectionBanner').innerHTML=`<span><b>${escapeHTML(first.collection)}</b> · ${escapeHTML(first.description)}</span><button class="quiet" id="clearCollection" style="color:white">Clear</button>`;
    $('clearCollection').onclick=()=>{$('collectionFilter').value='';renderLibrary();};
  }else $('activeCollectionBanner').classList.add('hidden');
}
['recipeSearch','collectionFilter','mistFilter','libraryView','sortRecipes'].forEach(id=>{
  $(id).addEventListener(id==='recipeSearch'?'input':'change',()=>{state.visible=24;renderLibrary();});
});
$('showMoreRecipes').onclick=()=>{state.visible+=24;renderLibrary();};

function defaultSlots(){
  return ['1',String(state.recipes.find(r=>r.slug==='golden-03')?.id||13),String(state.recipes.find(r=>r.slug==='documentary-01')?.id||31),
  String(state.recipes.find(r=>r.slug==='beach-01')?.id||21),String(state.recipes.find(r=>r.slug==='monochrome-01')?.id||91),
  String(state.recipes.find(r=>r.slug==='cinema-01')?.id||51),String(state.recipes.find(r=>r.slug==='night-01')?.id||61)];
}
function renderSlots(){
  let slots=store.get('slots',null); if(!slots){slots=defaultSlots();store.set('slots',slots);}
  const options=allRecipes().map(r=>`<option value="${escapeHTML(r.id)}">${escapeHTML(r.collection)} — ${escapeHTML(r.name)}</option>`).join('');
  $('slotGrid').innerHTML=slots.map((id,i)=>{
    const r=getRecipe(id)||allRecipes()[0];
    return `<article class="slot-card"><span class="slot-number">C${i+1}</span><img data-slot-image="${i}" src="${r.image}" alt=""><select data-slot="${i}">${options}</select><small>${i<5?'Permanent recommendation':'Rotating slot'}</small></article>`;
  }).join('');
  $$('[data-slot]').forEach(sel=>{const i=Number(sel.dataset.slot);sel.value=String(slots[i]);sel.onchange=()=>{slots[i]=sel.value;store.set('slots',slots);renderSlots();};});
  $$('[data-slot-image]').forEach(img=>img.onclick=()=>openRecipe(slots[Number(img.dataset.slot)]));
}
$('exportSlots').onclick=()=>downloadJSON({type:'Fuji Field C1-C7 plan',slots:store.get('slots',defaultSlots()).map((id,i)=>({slot:`C${i+1}`,recipe:getRecipe(id)}))},'fuji-c1-c7-plan.json');

function renderFinderIfVisible(){ if($('finder').classList.contains('active')) runFinder(); }
function runFinder(){
  const criteria={
    subject:$('finderSubject').value.toLowerCase(),time:$('finderTime').value,weather:$('finderWeather').value,
    mood:$('finderMood').value,filter:$('finderFilter').value,focal:$('finderFocal').value
  };
  const matches=topMatches(criteria,9);
  $('finderSummary').classList.remove('hidden');
  $('finderSummary').innerHTML=`<b>Best fit:</b> ${escapeHTML(matches[0].r.name)} scored ${matches[0].score}%. The ranking prioritizes ${escapeHTML(criteria.subject)}, ${escapeHTML(criteria.weather.toLowerCase())} conditions, ${escapeHTML(criteria.time.toLowerCase())}, and a ${escapeHTML(criteria.mood)} look.`;
  $('finderResults').innerHTML=matches.map(x=>recipeCard(x.r,x.score)).join('');
}
$('runFinder').onclick=runFinder;
$('useWeatherFinder').onclick=()=>{
  if(!state.weather){showToast('Load weather from Home or Planner first.');return;}
  $('finderWeather').value=weatherCondition(state.weather.data);
  const t=localTimeCategory(state.weather.data);
  $('finderTime').value=[...$('finderTime').options].some(o=>o.value===t)?t:'Any';
  runFinder();
};

async function searchLocation(query, choicesEl){
  if(!query.trim())return;
  choicesEl.innerHTML='Searching…';
  try{
    const url=`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=6&language=en&format=json`;
    const data=await fetch(url).then(r=>r.json());
    const results=data.results||[];
    choicesEl.innerHTML=results.length?results.map((x,i)=>`<button data-place="${i}">${escapeHTML(x.name)}, ${escapeHTML(x.admin1||x.country||'')}</button>`).join(''):'No locations found.';
    $$('[data-place]',choicesEl).forEach(b=>b.onclick=()=>{const x=results[Number(b.dataset.place)];loadWeather(x.latitude,x.longitude,`${x.name}, ${x.admin1||x.country||''}`);choicesEl.innerHTML='';});
  }catch{choicesEl.innerHTML='Weather search failed. Check your connection.';}
}
async function useCurrentLocation(){
  if(!navigator.geolocation){showToast('Location is not supported by this browser.');return;}
  navigator.geolocation.getCurrentPosition(p=>loadWeather(p.coords.latitude,p.coords.longitude,'Current location'),()=>showToast('Location permission was not granted.'),{enableHighAccuracy:false,timeout:10000});
}
async function loadWeather(lat,lon,name){
  $('weatherCard').innerHTML='Loading weather…'; $('plannerForecast').innerHTML='Loading forecast…';
  try{
    const params=new URLSearchParams({
      latitude:lat,longitude:lon,timezone:'auto',forecast_days:'7',
      current:'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,cloud_cover,wind_speed_10m,is_day',
      daily:'sunrise,sunset,weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
      temperature_unit:'fahrenheit',wind_speed_unit:'mph',precipitation_unit:'inch'
    });
    const data=await fetch(`https://api.open-meteo.com/v1/forecast?${params}`).then(r=>{if(!r.ok)throw new Error();return r.json();});
    state.weather={lat:Number(lat),lon:Number(lon),name,data,updated:Date.now()};store.set('weather',state.weather);renderWeatherState(state.weather);
  }catch{ $('weatherCard').innerHTML='Weather could not load. Check your connection.'; $('plannerForecast').innerHTML='Forecast could not load.'; }
}
function renderWeatherState(w){
  const d=w.data,c=d.current,condition=weatherCondition(d),time=localTimeCategory(d);
  const criteria={subject:'travel',weather:condition,time,mood:condition==='Sunny'?'vivid':condition==='Rain'?'cool':'natural',filter:'No filter',focal:'Any'};
  const rec=topMatches(criteria,1)[0]?.r;
  $('weatherCard').classList.remove('empty-state');
  $('weatherCard').innerHTML=`<div class="weather-current"><div class="weather-temp">${Math.round(c.temperature_2m)}°</div><div><h3>${escapeHTML(w.name)}</h3><div class="weather-meta"><span class="pill">${weatherLabel(c.weather_code)}</span><span class="pill">${c.cloud_cover}% cloud</span><span class="pill">${Math.round(c.wind_speed_10m)} mph wind</span><span class="pill">${c.relative_humidity_2m}% humidity</span></div></div></div>
  <div class="callout"><b>Shooting recommendation:</b> ${rec?`<button class="text-button" id="weatherRecipe">${escapeHTML(rec.name)}</button>`:'Load recipes'} for ${condition.toLowerCase()} conditions around ${time.toLowerCase()}. Sunrise ${new Date(d.daily.sunrise[0]).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}; sunset ${new Date(d.daily.sunset[0]).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}.</div>`;
  if($('weatherRecipe')) $('weatherRecipe').onclick=()=>openRecipe(rec.id);
  renderPlannerForecast(w);
}
function renderPlannerForecast(w){
  const d=w.data;
  $('plannerForecast').classList.remove('empty-state');
  $('plannerForecast').innerHTML=d.daily.time.map((date,i)=>{
    const sun=new Date(d.daily.sunset[i]); const golden=new Date(sun.getTime()-50*60000); const blue=new Date(sun.getTime()+15*60000);
    return `<article class="forecast-day"><b>${new Date(date+'T12:00').toLocaleDateString([],{weekday:'short'})}</b><small>${weatherLabel(d.daily.weather_code[i])}</small><p>${Math.round(d.daily.temperature_2m_max[i])}° / ${Math.round(d.daily.temperature_2m_min[i])}°</p><small>${d.daily.precipitation_probability_max[i]}% rain</small><hr><small>Golden ${golden.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}<br>Sunset ${sun.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}<br>Blue ${blue.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</small></article>`;
  }).join('');
}
$('homeLocationSearch').onclick=()=>searchLocation($('homeLocationInput').value,$('locationChoices'));
$('homeLocationInput').addEventListener('keydown',e=>{if(e.key==='Enter')$('homeLocationSearch').click();});
$('useLocationBtn').onclick=useCurrentLocation;
$('plannerSearch').onclick=()=>searchLocation($('plannerLocationInput').value,$('plannerChoices'));
$('plannerUseCurrent').onclick=useCurrentLocation;

function builderValues(){
  return {
    name:$('builderName').value.trim()||'Untitled Recipe',simulation:$('builderSimulation').value,scene:$('builderScene').value,
    warmth:Number($('builderWarmth').value),contrast:Number($('builderContrast').value),color:Number($('builderColor').value),
    softness:Number($('builderSoftness').value),grain:Number($('builderGrain').value),mist:$('builderMist').checked
  };
}
function updateBuilder(){
  const v=builderValues();
  $('warmthOut').value=v.warmth;$('contrastOut').value=v.contrast;$('colorOut').value=v.color;$('softnessOut').value=v.softness;$('grainOut').value=v.grain;
  $('builderPreview').src=v.scene;
  const sepia=Math.max(0,v.warmth)*.08, hue=v.warmth<0?Math.abs(v.warmth)*5:-v.warmth*2;
  const sat=1+v.color*.12, con=1+v.contrast*.09, bright=1-v.contrast*.015, blur=v.softness*.18;
  $('builderPreview').style.filter=`sepia(${sepia}) hue-rotate(${hue}deg) saturate(${sat}) contrast(${con}) brightness(${bright}) blur(${blur}px)`;
  $('builderGrainLayer').style.opacity=String(v.grain*.06);
  $('builderPreview').style.boxShadow=v.mist?'inset 0 0 60px rgba(255,245,225,.35)':'none';
  const settings=builderSettings(v);
  $('builderSettings').innerHTML=settingsGrid(settings);
}
function builderSettings(v){
  return {
    name:v.name,simulation:v.simulation,dr:Math.abs(v.contrast)>=3?'DR400':'DR200',wb:v.warmth>1?'Daylight':v.warmth<-1?'4300K':'Auto',
    r:Math.max(-9,Math.min(9,v.warmth)),b:Math.max(-9,Math.min(9,-v.warmth)),highlight:Math.max(-2,Math.min(4,-Math.round(v.contrast/2))),
    shadow:Math.max(-2,Math.min(4,Math.round(v.contrast/2))),color:v.color,sharpness:Math.max(-4,2-v.softness),nr:-2,
    grain:v.grain===0?'Off':v.grain===1?'Weak / Small':v.grain===2?'Weak / Large':'Strong / Small',cc:v.color>=2?'Strong':v.color<=-2?'Off':'Weak',
    ccblue:v.color>=2?'Strong':'Weak',clarity:Math.max(-5,Math.min(5,-v.softness)),exp:'0 to +1/3',focal:'24–55mm',aperture:'f/4–f/5.6',
    filter:v.mist?'Best with Black Mist 1/8':'No filter needed'
  };
}
['builderName','builderSimulation','builderScene','builderWarmth','builderContrast','builderColor','builderSoftness','builderGrain','builderMist'].forEach(id=>$(id).addEventListener('input',updateBuilder));
$('resetBuilder').onclick=()=>{ $('builderName').value='My Florida Evening';$('builderSimulation').value='REALA ACE';$('builderWarmth').value=2;$('builderContrast').value=0;$('builderColor').value=1;$('builderSoftness').value=1;$('builderGrain').value=1;$('builderMist').checked=false;updateBuilder(); };
$('saveCustomRecipe').onclick=()=>{
  const v=builderValues(),s=builderSettings(v),id=`custom-${Date.now()}`;
  const custom={id,slug:id,name:v.name,collection:'My Recipes',collectionSlug:'custom',description:'Custom recipe created in Fuji Field Companion.',
    ...s,weather:['Any'],times:['Any'],mood:v.warmth>1?'warm':v.warmth<-1?'cool':'natural',tags:['custom',v.name.toLowerCase()],
    rating:9,sourceImage:v.scene,image:v.scene,previewIncludesMist:v.mist,notes:'Custom starting point.'};
  state.custom.unshift(custom);store.set('customRecipes',state.custom);populateRecipeSelects();showToast('Custom recipe saved.');route('library');$('libraryView').value='custom';renderLibrary();
};

const controls={
  iso:{title:'ISO dial',body:'Sets sensor amplification. Use Auto ISO for most handheld work, with a minimum shutter speed appropriate to your subject. Higher ISO adds noise but is preferable to motion blur.'},
  shutter:{title:'Shutter-speed dial',body:'Controls exposure time and motion. Use A for aperture-priority shooting, then set a minimum shutter speed in Auto ISO. Use manual speeds when motion rendering is the main decision.'},
  exposure:{title:'Exposure compensation',body:'Brightens or darkens the camera’s metered exposure in semi-automatic modes. Recipes do not replace exposure judgment; this dial is often the fastest way to make a recipe look right.'},
  viewfinder:{title:'EVF',body:'Shows exposure, white balance, and the JPEG look before capture. Turn Natural Live View off when you want the preview to reflect your film simulation settings.'},
  q:{title:'Q menu',body:'A fast grid of frequently changed settings. Add Select Custom Setting, white balance, AF mode, face/eye detection, and Auto ISO for an efficient recipe workflow.'},
  joystick:{title:'Focus joystick',body:'Moves the focus point and navigates menus. Pressing it can recenter the point, depending on your button configuration.'},
  drive:{title:'DRIVE dial',body:'Selects single frame, burst, bracketing, panorama, and movie modes. Use single frame for deliberate shooting and a low burst for moving people or pets.'}
};
$$('.hotspot').forEach(b=>b.onclick=()=>{$$('.hotspot').forEach(x=>x.classList.remove('active'));b.classList.add('active');const c=controls[b.dataset.control];$('controlExplanation').innerHTML=`<h3>${c.title}</h3><p>${c.body}</p>`;});
const menuItems=[
 ['Select Custom Setting','IMAGE QUALITY SETTING','Chooses C1–C7. This is the fastest way to change a complete recipe bank.'],
 ['Edit/Save Custom Setting','IMAGE QUALITY SETTING','Edits, names, and saves custom banks. Store the full recipe here.'],
 ['Film Simulation','IMAGE QUALITY SETTING','Sets the base color and tonal response. It is the foundation of every recipe.'],
 ['Dynamic Range','IMAGE QUALITY SETTING','DR200 and DR400 preserve more highlights but require higher minimum ISO. Use them in bright or high-contrast scenes.'],
 ['White Balance / WB Shift','IMAGE QUALITY SETTING','White balance chooses the neutral reference; red/blue shift deliberately biases the color.'],
 ['Highlight Tone','IMAGE QUALITY SETTING','Controls bright tonal areas. Negative values soften highlights; positive values make them harder and darker.'],
 ['Shadow Tone','IMAGE QUALITY SETTING','Controls dark tonal areas. Positive values deepen shadows; negative values open them.'],
 ['Color','IMAGE QUALITY SETTING','Changes JPEG saturation. It does not affect RAW sensor data.'],
 ['Sharpness','IMAGE QUALITY SETTING','Controls edge sharpening in JPEGs. Excessive values can create halos.'],
 ['High ISO NR','IMAGE QUALITY SETTING','Reduces grain-like noise but can smear fine detail. Negative values preserve texture.'],
 ['Clarity','IMAGE QUALITY SETTING','Changes local contrast. Negative values soften; positive values add crispness. Nonzero clarity can slow JPEG processing.'],
 ['Grain Effect','IMAGE QUALITY SETTING','Adds simulated film grain to JPEGs. Size changes the texture scale.'],
 ['Color Chrome Effect','IMAGE QUALITY SETTING','Deepens highly saturated colors without simply raising global saturation.'],
 ['Color Chrome FX Blue','IMAGE QUALITY SETTING','Deepens blue areas such as sky and water.'],
 ['RAW Recording','IMAGE QUALITY SETTING','Choose lossless compressed RAW for smaller files without discarding image data.'],
 ['AF Mode','AF/MF SETTING','Single Point is precise; Zone is easier for moving subjects; Wide/Tracking hands more control to the camera.'],
 ['AF-S / AF-C','Front focus selector','AF-S locks for still subjects. AF-C continuously updates for movement.'],
 ['Face/Eye Detection','AF/MF SETTING','Useful for people and animals, but verify the active box is on the intended eye.'],
 ['Subject Detection','AF/MF SETTING','Select the relevant subject type when photographing animals, birds, vehicles, and other supported subjects.'],
 ['Photometry','SHOOTING SETTING','Multi works broadly; spot meters a small area; center-weighted prioritizes the middle of the frame.'],
 ['Auto ISO','SHOOTING SETTING','Set default ISO, maximum ISO, and minimum shutter speed. Create different Auto ISO banks for still, people, and action.'],
 ['Natural Live View','SCREEN SET-UP','Turn it off to preview film simulation and tone settings through the EVF/LCD.'],
 ['Preview Exp./WB in Manual Mode','SCREEN SET-UP','Shows the expected exposure and white balance while shooting manual. Disable only for flash or studio situations where preview becomes too dark.'],
 ['Image Stabilization Mode','SHOOTING SETTING','Continuous stabilization helps framing; shooting-only can conserve power. Stabilization cannot freeze subject motion.'],
 ['Electronic Shutter','SHOOTING SETTING','Silent and fast, but can cause rolling-shutter distortion and banding under some artificial lights.'],
 ['Flicker Reduction','SHOOTING SETTING','Helps maintain consistent exposure under flickering artificial light, especially during bursts.'],
 ['Focus Check','AF/MF SETTING','Magnifies the image when manually focusing, useful for static subjects and adapted lenses.'],
 ['Focus Peaking','AF/MF SETTING','Highlights high-contrast edges to assist manual focus.'],
 ['Histogram','DISP. CUSTOM SETTING','Use it to protect highlights and evaluate exposure more reliably than LCD brightness.'],
 ['Dual Card Slot Setting','SAVE DATA SET-UP','Configure sequential, backup, or RAW/JPEG separation depending on your redundancy and workflow needs.']
];
function renderMenuExplorer(){
  const q=$('menuSearch').value.trim().toLowerCase();
  const list=menuItems.filter(x=>!q||x.join(' ').toLowerCase().includes(q));
  $('menuExplorer').innerHTML=list.map((x,i)=>`<div class="menu-item"><button data-menu="${i}"><span>${escapeHTML(x[0])}</span><small>${escapeHTML(x[1])}</small></button><div class="menu-detail">${escapeHTML(x[2])}</div></div>`).join('');
  $$('[data-menu]').forEach(b=>b.onclick=()=>b.parentElement.classList.toggle('open'));
}
$('menuSearch').addEventListener('input',renderMenuExplorer);
const lessons=[
 {id:'start',title:'Start here: first-day setup',html:`<h2>First-day X‑T5 setup</h2><p>Set the camera to RAW+JPEG, lossless-compressed RAW, sRGB JPEG, Auto ISO, and aperture priority. Put Select Custom Setting, white balance, AF mode, face/eye detection, and Auto ISO in the Q menu.</p><div class="exercise"><b>Exercise:</b> Take the same scene at 16mm, 35mm, and 80mm. Do not move your feet. Compare how framing and background compression change.</div>`},
 {id:'exposure',title:'Exposure triangle',html:`<h2>Exposure triangle</h2><p><b>Aperture</b> controls depth of field and light. <b>Shutter speed</b> controls motion blur. <b>ISO</b> amplifies the captured signal. For general use, aperture priority plus Auto ISO keeps the process simple while retaining control over depth of field.</p><h3>Practical minimum shutter speeds</h3><p>Still scenes: 1/125. People and pets: 1/250–1/500. Action: 1/1000 or faster. Stabilization helps camera shake, not subject motion.</p>`},
 {id:'focus',title:'Autofocus',html:`<h2>Autofocus</h2><p>Use AF-S and a small single point for stationary subjects. Use AF-C and Zone AF for moving subjects. For pets or people, enable the relevant detection mode but watch the focus box rather than assuming it chose correctly.</p>`},
 {id:'recipes',title:'How recipes work',html:`<h2>How recipes work</h2><p>A recipe is a saved set of JPEG-processing choices. It changes the preview and JPEG before you press the shutter. RAW files preserve much more flexibility, which is why RAW+JPEG is the safest learning workflow.</p>`},
 {id:'wb',title:'White balance and shift',html:`<h2>White balance</h2><p>White balance sets the neutral point. The red/blue shift then biases that point. A shift that looks beautiful in sun can look strange indoors, so evaluate it under the actual light.</p><div class="exercise"><b>Exercise:</b> Photograph a white object using Auto, Daylight, Shade, 4300K, and 6000K. Compare the background and skin-like warm colors.</div>`},
 {id:'dr',title:'Dynamic range',html:`<h2>Dynamic range</h2><p>DR200 and DR400 protect highlights by using a higher sensor exposure index and a different JPEG tone curve. They are useful for beaches, clouds, white buildings, and backlight. They do not rescue clipped RAW highlights after the fact.</p>`},
 {id:'simulations',title:'Film simulations',html:`<h2>Film simulations</h2><p>PROVIA and REALA ACE are balanced. Velvia emphasizes color. ASTIA is gentler. Classic Chrome is muted and documentary. Classic Negative is expressive and contrasty. Nostalgic Negative warms highlights. ETERNA is low-contrast and cinematic. ACROS provides refined monochrome tonality.</p>`},
 {id:'mist',title:'Black Mist filters',html:`<h2>Black Mist 1/8</h2><p>A 1/8 diffusion filter lightly blooms highlights and lowers fine contrast. It works especially well with backlight, neon, and night scenes. Remove it when flare resistance, maximum detail, or crisp landscapes matter.</p><p>Previews marked “Best with Black Mist 1/8” include a simulated diffusion approximation.</p>`},
 {id:'lens',title:'XF 16–80mm lens guide',html:`<h2>XF 16–80mm practical guide</h2><p><b>16–24mm:</b> architecture, landscapes, interiors, establishing shots. <b>24–35mm:</b> travel and environmental scenes. <b>35–55mm:</b> natural perspective, food, details. <b>55–80mm:</b> compression, pets, portraits, distant details.</p><p>At 16mm, keep important faces and straight lines away from extreme edges. At 80mm, watch shutter speed even with stabilization.</p>`},
 {id:'composition',title:'Composition',html:`<h2>Composition</h2><p>Build photographs from subject, background, light, and timing. Simplify the frame before relying on color. Look for leading lines, repetition, foreground layers, clean edges, and separation between the subject and background.</p><div class="exercise"><b>Exercise:</b> Create a three-image story: one wide scene, one medium context image, and one close detail.</div>`},
 {id:'raw',title:'RAW vs JPEG',html:`<h2>RAW and JPEG</h2><p>JPEG is the finished in-camera interpretation. RAW stores flexible sensor data. RAW+JPEG lets you enjoy the recipe immediately while keeping room to correct exposure, color, and tone later.</p>`},
 {id:'night',title:'Night photography',html:`<h2>Night photography</h2><p>Use a fast enough shutter speed for the subject, allow higher ISO, and protect bright signs. Artificial lights often benefit from 3200K–4600K white balance. Check for banding if using the electronic shutter.</p>`},
 {id:'travel',title:'Travel workflow',html:`<h2>Travel workflow</h2><p>Keep one neutral recipe, one warm recipe, one documentary recipe, one vivid landscape recipe, and one monochrome recipe permanently saved. Use C6 and C7 for the trip or event. Back up a themed seven-bank profile in XApp.</p>`},
 {id:'mistakes',title:'Common mistakes',html:`<h2>Common mistakes</h2><p>Do not judge exposure only from LCD brightness. Avoid shutter speeds that are too slow for people. Do not assume stabilization freezes motion. Watch clipped highlights. Avoid changing five recipe settings at once when learning what each one does.</p>`},
 {id:'practice',title:'Beginner exercises',html:`<h2>Beginner practice plan</h2><ol><li>One week using only C1.</li><li>One walk using only 16mm.</li><li>One walk using only 80mm.</li><li>Photograph the same scene in sun, cloud, and golden hour.</li><li>Compare a neutral, vivid, muted, and monochrome recipe.</li></ol>`}
];
function renderGuide(){
  if(!$('controlExplanation').innerHTML) document.querySelector('.hotspot')?.click();
  renderMenuExplorer();
  $('lessonList').innerHTML=lessons.map((l,i)=>`<button data-lesson="${l.id}" class="${i===0?'active':''}">${escapeHTML(l.title)}</button>`).join('');
  $$('[data-lesson]').forEach(b=>b.onclick=()=>{$$('[data-lesson]').forEach(x=>x.classList.remove('active'));b.classList.add('active');$('lessonContent').innerHTML=lessons.find(l=>l.id===b.dataset.lesson).html;});
  $('lessonContent').innerHTML=lessons[0].html;
}

const defaultGear=['Fujifilm X‑T5 body','XF 16–80mm F4 R OIS WR','Spare NP‑W235 battery','Battery charger / USB‑C cable','Two formatted SD cards','Lens cloth and blower','Weather cover','Black Mist 1/8 filter'];
const packingTemplates={
  day:['Camera body','XF 16–80mm','Spare battery','One spare SD card','Lens cloth','Water'],
  travel:['Camera body','XF 16–80mm','Two spare batteries','Two spare SD cards','Charger','USB‑C cable','Lens cloth','Weather cover','Small bag','Travel adapter'],
  night:['Camera body','XF 16–80mm','Black Mist 1/8','Spare battery','Tripod','Remote / self timer','Lens cloth','Small light'],
  rain:['Camera body','XF 16–80mm','Weather cover','Microfiber cloths','Plastic bag','Spare battery','Dry pouch']
};
const maintenanceDefaults=[
 {id:'lens',name:'Clean lens surfaces',days:14,last:null},
 {id:'sensor',name:'Check sensor for dust',days:30,last:null},
 {id:'backup',name:'Back up and verify photos',days:7,last:null},
 {id:'battery',name:'Check battery health and contacts',days:90,last:null},
 {id:'firmware',name:'Check official firmware page',days:90,last:null},
 {id:'cards',name:'Back up, then format SD cards in camera',days:14,last:null}
];
const challenges=[
 'Photograph one subject at 16mm, 35mm, and 80mm without moving your feet.',
 'Make ten photographs using only Daily Natural.',
 'Create a three-image story: wide scene, medium context, close detail.',
 'Photograph reflections after rain without including a face.',
 'Use ACROS and photograph only shape, texture, and shadow.',
 'At golden hour, expose once for the sky and once for the foreground.',
 'Make five photographs where the background is simpler than the subject.',
 'Photograph the same object with warm, neutral, and cool white balance.',
 'Use 80mm to isolate details you would normally overlook.',
 'Use 16mm and keep every edge of the frame intentional.'
];
function renderCheckList(elId,key,items){
  $(elId).innerHTML=items.map((x,i)=>`<div class="check-row"><input type="checkbox" ${x.done?'checked':''} data-check="${key}:${i}"><span class="${x.done?'done':''}">${escapeHTML(x.text||x)}</span><button data-delete="${key}:${i}">×</button></div>`).join('');
  $$(`[data-check^="${key}:"]`).forEach(cb=>cb.onchange=()=>{const list=store.get(key,items);list[Number(cb.dataset.check.split(':')[1])].done=cb.checked;store.set(key,list);renderPlanner();});
  $$(`[data-delete^="${key}:"]`).forEach(b=>b.onclick=()=>{const list=store.get(key,items);list.splice(Number(b.dataset.delete.split(':')[1]),1);store.set(key,list);renderPlanner();});
}
function renderPlanner(){
  if(state.weather) renderPlannerForecast(state.weather);
  const shots=store.get('shots',[]),packing=store.get('packing',[]),gear=store.get('gear',defaultGear.map(text=>({text,done:false})));
  renderCheckList('shotList','shots',shots);renderCheckList('packingList','packing',packing);renderCheckList('gearList','gear',gear);
  let maint=store.get('maintenance',maintenanceDefaults);
  $('maintenanceList').innerHTML=maint.map((m,i)=>{
    const due=!m.last || Date.now()-new Date(m.last).getTime()>m.days*86400000;
    return `<div class="maintenance-item ${due?'due':''}"><b>${escapeHTML(m.name)}</b><small>${m.last?`Last done ${new Date(m.last).toLocaleDateString()}`:'Not recorded'} · every ${m.days} days</small><button class="text-button" data-maint="${i}">Mark done today</button></div>`;
  }).join('');
  $$('[data-maint]').forEach(b=>b.onclick=()=>{maint[Number(b.dataset.maint)].last=new Date().toISOString();store.set('maintenance',maint);renderPlanner();});
  $('challengeText').textContent=store.get('challenge',challenges[0]);
}
$('shotForm').onsubmit=e=>{e.preventDefault();const text=$('shotInput').value.trim();if(!text)return;const list=store.get('shots',[]);list.push({text,done:false});store.set('shots',list);$('shotInput').value='';renderPlanner();};
$('gearForm').onsubmit=e=>{e.preventDefault();const text=$('gearInput').value.trim();if(!text)return;const list=store.get('gear',defaultGear.map(text=>({text,done:false})));list.push({text,done:false});store.set('gear',list);$('gearInput').value='';renderPlanner();};
$('loadPacking').onclick=()=>{const list=packingTemplates[$('packingTemplate').value].map(text=>({text,done:false}));store.set('packing',list);renderPlanner();};
$('newChallenge').onclick=()=>{const c=challenges[Math.floor(Math.random()*challenges.length)];store.set('challenge',c);$('challengeText').textContent=c;};

function populateRecipeSelects(){
  const opts=allRecipes().map(r=>`<option value="${escapeHTML(r.id)}">${escapeHTML(r.collection)} — ${escapeHTML(r.name)}</option>`).join('');
  $('journalRecipe').innerHTML=opts;
}
function resizeImageFile(file,maxW=700,maxH=500,quality=.62){
  return new Promise((resolve,reject)=>{
    const img=new Image(),url=URL.createObjectURL(file);
    img.onload=()=>{let w=img.width,h=img.height,scale=Math.min(1,maxW/w,maxH/h);const c=document.createElement('canvas');c.width=Math.round(w*scale);c.height=Math.round(h*scale);c.getContext('2d').drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(url);resolve(c.toDataURL('image/jpeg',quality));};
    img.onerror=reject;img.src=url;
  });
}
$('journalForm').onsubmit=async e=>{
  e.preventDefault();
  let image='';
  if($('journalPhoto').files[0]){try{image=await resizeImageFile($('journalPhoto').files[0]);}catch{}}
  const entry={id:Date.now(),title:$('journalTitle').value,date:$('journalDate').value,rating:Number($('journalRating').value),location:$('journalLocation').value,
    recipeId:$('journalRecipe').value,lens:$('journalLens').value,notes:$('journalNotes').value,image};
  const entries=store.get('journal',[]);entries.unshift(entry);
  try{store.set('journal',entries);}catch{entry.image='';store.set('journal',entries);showToast('Entry saved without the photo because browser storage is full.');}
  e.target.reset();$('journalDate').value=new Date().toISOString().slice(0,10);$('journalLens').value='XF 16–80mm';renderJournal();showToast('Journal entry saved.');
};
function renderJournal(){
  populateRecipeSelects(); if(!$('journalDate').value)$('journalDate').value=new Date().toISOString().slice(0,10);
  const entries=store.get('journal',[]);
  const counts={};entries.forEach(x=>{counts[x.recipeId]=(counts[x.recipeId]||0)+1;});
  const topId=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]?.[0],top=getRecipe(topId);
  $('journalStats').innerHTML=`<article><b>${entries.length}</b><span>entries</span></article><article><b>${entries.length?Math.round(entries.reduce((a,b)=>a+b.rating,0)/entries.length*10)/10:'—'}</b><span>average rating</span></article><article><b>${top?escapeHTML(top.name):'—'}</b><span>most used recipe</span></article>`;
  $('journalEntries').innerHTML=entries.length?entries.map(e=>{
    const r=getRecipe(e.recipeId);
    return `<article class="journal-entry ${e.image?'':'no-image'}">${e.image?`<img src="${e.image}" alt="">`:''}<div><h3>${escapeHTML(e.title)}</h3><div class="entry-meta">${new Date(e.date+'T12:00').toLocaleDateString()} · ${escapeHTML(e.location||'No location')} · ${'★'.repeat(e.rating)}</div><p><b>${escapeHTML(r?.name||'Unknown recipe')}</b> · ${escapeHTML(e.lens)}</p><p>${escapeHTML(e.notes)}</p><div class="entry-actions"><button data-delete-entry="${e.id}">Delete</button></div></div></article>`;
  }).join(''):'<div class="empty-state">No journal entries yet.</div>';
  $$('[data-delete-entry]').forEach(b=>b.onclick=()=>{const next=entries.filter(e=>String(e.id)!==b.dataset.deleteEntry);store.set('journal',next);renderJournal();});
}

$('exposureSuggest').onclick=()=>{
  const s=$('exposureSubject').value,l=$('exposureLight').value;
  const speeds={still:'1/125 sec',people:'1/250–1/500 sec',action:'1/1000–1/2000 sec',water:'1/15–1/2 sec on a tripod',night:'1/125–1/250 sec'}[s];
  const aperture=l==='sun'?'f/5.6–f/8':l==='cloud'?'f/4–f/5.6':l==='indoor'?'f/4':'f/4';
  const iso=l==='sun'?'ISO 125–400':l==='cloud'?'Auto ISO up to 1600':l==='indoor'?'Auto ISO up to 6400':'Auto ISO up to 12800';
  $('exposureResult').innerHTML=`<b>Start with:</b> ${speeds}, ${aperture}, ${iso}. Use ${['people','action'].includes(s)?'AF-C with Zone AF':'AF-S with Single Point AF'}. Check the histogram and adjust exposure compensation.`;
};

function readExif(buffer){
  const v=new DataView(buffer); if(v.getUint16(0)!==0xFFD8) throw new Error('Not a JPEG');
  let p=2,tiff=null;
  while(p+4<v.byteLength){
    if(v.getUint8(p)!==0xFF){p++;continue;}
    const marker=v.getUint8(p+1); if(marker===0xDA||marker===0xD9)break;
    const len=v.getUint16(p+2); if(marker===0xE1&&p+10<v.byteLength){
      const sig=String.fromCharCode(...new Uint8Array(buffer,p+4,6));
      if(sig==='Exif\u0000\u0000'){tiff=p+10;break;}
    } p+=2+len;
  }
  if(tiff===null) throw new Error('No EXIF block');
  const little=v.getUint16(tiff)===0x4949;
  const u16=o=>v.getUint16(o,little),u32=o=>v.getUint32(o,little),i32=o=>v.getInt32(o,little);
  if(u16(tiff+2)!==42) throw new Error('Invalid TIFF header');
  const typeSize={1:1,2:1,3:2,4:4,5:8,7:1,9:4,10:8};
  function val(type,count,entry){
    const size=(typeSize[type]||1)*count;const off=size<=4?entry+8:tiff+u32(entry+8);
    const one=(idx)=>{
      const o=off+idx*(typeSize[type]||1);
      if(type===2){let s='';for(let j=0;j<count&&v.getUint8(off+j);j++)s+=String.fromCharCode(v.getUint8(off+j));return s;}
      if(type===3)return u16(o);if(type===4)return u32(o);if(type===5)return u32(o)/u32(o+4);if(type===9)return i32(o);if(type===10)return i32(o)/i32(o+4);return v.getUint8(o);
    };
    if(type===2)return one(0); if(count===1)return one(0); return Array.from({length:count},(_,i)=>one(i));
  }
  function ifd(rel){
    const base=tiff+rel,n=u16(base),out={};
    for(let i=0;i<n;i++){const e=base+2+i*12,tag=u16(e),type=u16(e+2),count=u32(e+4);out[tag]=val(type,count,e);}
    return out;
  }
  const a=ifd(u32(tiff+4)),ex=a[0x8769]?ifd(a[0x8769]):{},gps=a[0x8825]?ifd(a[0x8825]):{};
  const result={Make:a[0x010F],Model:a[0x0110],Software:a[0x0131],Date:a[0x0132],ExposureTime:ex[0x829A],FNumber:ex[0x829D],ISO:ex[0x8827],
    DateTimeOriginal:ex[0x9003],FocalLength:ex[0x920A],LensModel:ex[0xA434],Width:ex[0xA002],Height:ex[0xA003]};
  if(gps[2]&&gps[4]){
    const dec=x=>x[0]+x[1]/60+x[2]/3600;
    result.Latitude=dec(gps[2])*(gps[1]==='S'?-1:1);result.Longitude=dec(gps[4])*(gps[3]==='W'?-1:1);
  }
  return result;
}
$('exifFile').onchange=async()=>{
  const file=$('exifFile').files[0];if(!file)return;
  try{
    const ex=readExif(await file.arrayBuffer());
    const rows=Object.entries(ex).filter(([,v])=>v!==undefined&&v!==null&&v!=='').map(([k,v])=>{
      let display=v;if(k==='ExposureTime'&&typeof v==='number')display=v<1?`1/${Math.round(1/v)} sec`:`${v} sec`;
      if(k==='FNumber')display=`f/${Number(v).toFixed(1)}`;if(k==='FocalLength')display=`${Number(v).toFixed(1)} mm`;
      return `<div><b>${escapeHTML(k)}</b></div><div>${escapeHTML(display)}</div>`;
    }).join('');
    $('exifResult').innerHTML=`<div class="exif-table">${rows}</div>`;
    if(ex.Latitude&&ex.Longitude){$('mapLat').value=ex.Latitude;$('mapLon').value=ex.Longitude;showToast('GPS coordinates copied to the map form.');}
  }catch(err){$('exifResult').innerHTML=`<div class="callout">No readable EXIF metadata was found. ${escapeHTML(err.message)}</div>`;}
};

function renderLocations(){
  const pins=store.get('locations',[]);
  $('mapFallback').innerHTML=pins.map((p,i)=>`<div class="location-row"><span><b>${escapeHTML(p.name)}</b> · ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}</span><button class="text-button" data-remove-pin="${i}">Remove</button></div>`).join('')||'<span class="empty-state">No saved locations.</span>';
  $$('[data-remove-pin]').forEach(b=>b.onclick=()=>{pins.splice(Number(b.dataset.removePin),1);store.set('locations',pins);renderLocations();refreshMapMarkers();});
}
function initMap(){
  if(state.map){state.map.invalidateSize();refreshMapMarkers();return;}
  if(!window.L){$('photoMap').innerHTML='<div class="empty-state">The online map library did not load. Saved coordinates still work below.</div>';renderLocations();return;}
  state.map=L.map('photoMap').setView([27.95,-82.46],8);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(state.map);
  refreshMapMarkers();renderLocations();
}
function refreshMapMarkers(){
  if(!state.map)return;state.mapMarkers.forEach(m=>m.remove());state.mapMarkers=[];
  const pins=store.get('locations',[]);
  pins.forEach(p=>state.mapMarkers.push(L.marker([p.lat,p.lon]).addTo(state.map).bindPopup(escapeHTML(p.name))));
  if(pins.length)state.map.fitBounds(pins.map(p=>[p.lat,p.lon]),{padding:[30,30],maxZoom:12});
}
$('addMapPin').onclick=()=>{
  const name=$('mapName').value.trim()||'Saved location',lat=Number($('mapLat').value),lon=Number($('mapLon').value);
  if(!Number.isFinite(lat)||!Number.isFinite(lon)){showToast('Enter valid latitude and longitude.');return;}
  const pins=store.get('locations',[]);pins.push({name,lat,lon});store.set('locations',pins);$('mapName').value='';renderLocations();refreshMapMarkers();showToast('Location saved.');
};

function renderTools(){
  renderLocations();
  const online=navigator.onLine?'Online':'Offline';
  $('appStatus').innerHTML=`<p><b>${online}</b></p><p>${'serviceWorker' in navigator?'Offline recipe caching is supported.':'Service workers are not supported in this browser.'}</p><p>${state.recipes.length} built-in recipes · ${state.custom.length} custom recipes · ${store.get('journal',[]).length} journal entries.</p>`;
  $('exposureSuggest').click();
}
$('exportBackup').onclick=()=>{
  const data={format:'Fuji Field Companion backup',version:2,exported:new Date().toISOString(),data:{}};
  for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k.startsWith(KEY))data.data[k]=localStorage.getItem(k);}
  downloadJSON(data,`fuji-field-backup-${new Date().toISOString().slice(0,10)}.json`);
};
$('importBackup').onchange=async()=>{
  const file=$('importBackup').files[0];if(!file)return;
  try{const data=JSON.parse(await file.text());if(!data.data)throw new Error();Object.entries(data.data).forEach(([k,v])=>{if(k.startsWith(KEY))localStorage.setItem(k,v);});showToast('Backup imported. Reloading…');setTimeout(()=>location.reload(),800);}catch{showToast('That backup file is not valid.');}
};
$('clearLocalData').onclick=()=>{if(!confirm('Clear all Fuji Field favorites, notes, custom recipes, journal entries, gear, lists, and locations from this browser?'))return;[...Array(localStorage.length)].forEach(()=>{});Object.keys(localStorage).filter(k=>k.startsWith(KEY)).forEach(k=>localStorage.removeItem(k));location.reload();};
$('refreshApp').onclick=async()=>{if('serviceWorker'in navigator){const regs=await navigator.serviceWorker.getRegistrations();await Promise.all(regs.map(r=>r.update()));}location.reload();};

function initTheme(){
  const theme=store.get('theme',matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
  document.documentElement.dataset.theme=theme;
}
$('themeBtn').onclick=()=>{const next=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=next;store.set('theme',next);};

window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();state.deferredInstall=e;$('installBtn').classList.remove('hidden');});
$('installBtn').onclick=async()=>{if(!state.deferredInstall){showToast('On iPhone, use Safari Share → Add to Home Screen.');return;}state.deferredInstall.prompt();await state.deferredInstall.userChoice;state.deferredInstall=null;$('installBtn').classList.add('hidden');};

async function init(){
  initTheme();
  try{state.recipes=await fetch('data/recipes.json').then(r=>{if(!r.ok)throw new Error();return r.json();});}
  catch{document.body.innerHTML='<main class="shell"><div class="callout"><h2>Recipe data could not load.</h2><p>Open the site through GitHub Pages or a local web server, not by double-clicking index.html.</p></div></main>';return;}
  if(state.favorites===null){state.favorites=state.recipes.filter(r=>r.favoriteDefault).map(r=>String(r.id));store.set('favorites',state.favorites);}
  renderHome();renderLibrary();renderSlots();renderGuide();renderPlanner();renderJournal();renderTools();populateRecipeSelects();
  $('finderResults').innerHTML=topMatches({subject:'travel',time:'Any',weather:'Sunny',mood:'natural',filter:'No filter',focal:'Any'},6).map(x=>recipeCard(x.r,x.score)).join('');
  updateBuilder();
  if(state.weather)renderWeatherState(state.weather);
  if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('service-worker.js').catch(()=>{}));
}
init();
