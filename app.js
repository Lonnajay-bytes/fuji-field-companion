
let recipes=[], visible=18, compare=[];
const $=id=>document.getElementById(id);
let favorites=JSON.parse(localStorage.getItem('fujiFav')||'[]');

const lessons={
recipes:`<h3>How recipes work</h3><p>A Fujifilm recipe is a group of image-quality settings applied before capture. The JPEG records the look. RAW preserves more sensor information for later editing. Save your most-used looks in C1–C7.</p>`,
exposure:`<h3>Exposure triangle</h3><p><b>Aperture</b> controls depth of field and light. <b>Shutter speed</b> controls motion blur. <b>ISO</b> amplifies the captured signal. For learning, Aperture Priority with Auto ISO is a practical starting point.</p>`,
focus:`<h3>Autofocus</h3><p>Use AF-S for still subjects and AF-C for movement. Single-point AF is precise; Zone AF is easier for subjects that move unpredictably.</p>`,
wb:`<h3>White balance shift</h3><p>White balance sets the neutral reference. Red/blue shift biases that reference. Large shifts can look excellent in one lighting condition and strange in another, so test under the actual light.</p>`,
mist:`<h3>Black Mist 1/8</h3><p>A diffusion filter lightly blooms bright highlights and reduces fine contrast. It is optional. Remove it when maximum crispness or flare resistance matters.</p>`,
raw:`<h3>RAW + JPEG</h3><p>RAW+JPEG gives you a finished in-camera image and a flexible original. Keep the JPEG when the recipe succeeds; edit the RAW when you need larger corrections.</p>`
};

function go(id){document.getElementById(id).scrollIntoView({behavior:'smooth'});$('nav').classList.remove('open')}
document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.go)));
$('menuBtn').onclick=()=>$('nav').classList.toggle('open');

function card(r,score){
 const fav=favorites.includes(r.id), mist=r.filter.includes('Black Mist');
 return `<article class="recipe"><div class="pills"><span class="pill">${r.collection}</span>${score?`<span class="pill">${score}% match</span>`:''}</div><h3>${r.name}</h3><p>${r.simulation} · ${r.time} · ${r.focal}</p><div class="pills"><span class="pill ${mist?'mist':''}">${r.filter}</span><span class="pill">★ ${r.rating}</span></div><div class="recipe-actions"><button onclick="openRecipe(${r.id})">Settings</button><button onclick="toggleCompare(${r.id})">Compare</button><button class="fav ${fav?'active':''}" onclick="toggleFav(${r.id})">♥</button></div></article>`;
}
function filtered(){
 const q=$('search').value.toLowerCase(),c=$('collection').value,f=$('filterSelect').value,v=$('viewSelect').value;
 return recipes.filter(r=>(!q||JSON.stringify(r).toLowerCase().includes(q))&&(!c||r.collection===c)&&(!f||r.filter===f)&&(v!=='fav'||favorites.includes(r.id)));
}
function render(){
 const a=filtered();$('recipeGrid').innerHTML=a.slice(0,visible).map(r=>card(r)).join('');
 $('moreBtn').style.display=visible>=a.length?'none':'block';
}
['search','collection','filterSelect','viewSelect'].forEach(id=>$(id).addEventListener(id==='search'?'input':'change',render));
$('moreBtn').onclick=()=>{visible+=18;render()};

function toggleFav(id){favorites=favorites.includes(id)?favorites.filter(x=>x!==id):[...favorites,id];localStorage.setItem('fujiFav',JSON.stringify(favorites));render()}
function openRecipe(id){
 const r=recipes.find(x=>x.id===id);
 const fields=[['Film simulation',r.simulation],['Dynamic range',r.dr],['White balance',r.wb],['WB shift',`R ${r.r>=0?'+':''}${r.r}, B ${r.b>=0?'+':''}${r.b}`],['Highlight',r.highlight],['Shadow',r.shadow],['Color',r.color],['Sharpness',r.sharpness],['High ISO NR',r.nr],['Grain',r.grain],['Color Chrome FX',r.cc],['Color Chrome FX Blue',r.ccblue],['Clarity',r.clarity],['Focal length',r.focal],['Filter',r.filter]];
 $('modalContent').innerHTML=`<p class="eyebrow">${r.collection}</p><h2>${r.name}</h2><div class="settings-grid">${fields.map(x=>`<div class="setting"><small>${x[0]}</small><b>${x[1]}</b></div>`).join('')}</div>`;
 $('modal').classList.add('show');
}
$('closeModal').onclick=()=>$('modal').classList.remove('show');
$('modal').onclick=e=>{if(e.target===$('modal'))$('modal').classList.remove('show')};

function toggleCompare(id){compare=compare.includes(id)?compare.filter(x=>x!==id):(compare.length<3?[...compare,id]:compare);updateCompare()}
function updateCompare(){ $('compareNames').textContent=compare.map(id=>recipes.find(r=>r.id===id).name).join(' • '); $('compareTray').classList.toggle('show',compare.length>0)}
$('clearCompare').onclick=()=>{compare=[];updateCompare()};
$('openCompare').onclick=()=>{if(compare.length<2)return alert('Choose at least two recipes.');const rs=compare.map(id=>recipes.find(r=>r.id===id));const keys=['simulation','dr','wb','filter','highlight','shadow','color','clarity','focal'];$('modalContent').innerHTML=`<h2>Recipe comparison</h2><div style="overflow:auto"><table style="width:100%;border-collapse:collapse"><tr><th></th>${rs.map(r=>`<th style="padding:8px;border:1px solid #ddd">${r.name}</th>`).join('')}</tr>${keys.map(k=>`<tr><td style="padding:8px;border:1px solid #ddd"><b>${k}</b></td>${rs.map(r=>`<td style="padding:8px;border:1px solid #ddd">${r[k]}</td>`).join('')}</tr>`).join('')}</table></div>`;$('modal').classList.add('show')};

$('findBtn').onclick=()=>{
 const s=$('subject').value,t=$('time').value,w=$('weather').value,f=$('filter').value,m=$('mood').value;
 const scored=recipes.map(r=>{let n=45;if(r.tags.includes(s))n+=22;if(r.time===t||t==='Any')n+=12;if(r.weather===w)n+=8;if(r.tags.includes(m))n+=10;if(f==='Black Mist 1/8'&&r.filter!=='No filter needed')n+=8;if(f==='No filter'&&r.filter!=='Best with Black Mist 1/8')n+=8;return [Math.min(99,n),r]}).sort((a,b)=>b[0]-a[0]).slice(0,3);
 $('finderResults').innerHTML=scored.map(x=>card(x[1],x[0])).join('');
};

document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');$('learnPanel').innerHTML=lessons[b.dataset.tab]});
$('learnPanel').innerHTML=lessons.recipes;

$('exposureBtn').onclick=()=>{
 const m=$('motion').value,l=$('light').value;
 const ss=m==='still'?'1/125 sec':m==='people'?'1/250–1/500 sec':'1/1000 sec or faster';
 const ap=l==='sun'?'f/5.6–f/8':l==='cloud'?'f/4–f/5.6':'f/4';
 const iso=l==='sun'?'ISO 125–400':l==='cloud'?'Auto ISO to 1600':l==='indoor'?'Auto ISO to 6400':'Auto ISO to 12800';
 $('exposureOut').innerHTML=`<b>Start with:</b> ${ss}, ${ap}, ${iso}.`;
};
$('goldBtn').onclick=()=>{
 const v=$('sunset').value;if(!v)return $('goldOut').innerHTML='<p>Enter a sunset time first.</p>';
 let [h,m]=v.split(':').map(Number),d=new Date(2000,0,1,h,m),fmt=x=>x.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
 $('goldOut').innerHTML=`<div class="callout"><b>${fmt(new Date(d-60*60000))}</b> arrive<br><b>${fmt(new Date(d-35*60000))}</b> start golden-hour shooting<br><b>${fmt(d)}</b> sunset<br><b>${fmt(new Date(d.getTime()+15*60000))}</b> blue hour</div>`;
};

const gear=['Fujifilm X‑T5','XF 16–80mm F4','Spare NP‑W235 battery','Two formatted SD cards','Black Mist 1/8 filter','Lens cloth / blower'];
$('gearList').innerHTML=gear.map((g,i)=>`<label><input type="checkbox" data-gear="${i}">${g}</label>`).join('');
document.querySelectorAll('[data-gear]').forEach(x=>{const k='gear-'+x.dataset.gear;x.checked=localStorage.getItem(k)==='true';x.onchange=()=>localStorage.setItem(k,x.checked)});
const challenges=['Shoot one subject at 16mm, 35mm, and 80mm without moving your feet.','Make ten photos using only C1 Everyday Natural.','Create a three-image story: wide, medium, detail.','Photograph reflections after rain without including a face.','Use ACROS and photograph only shape, texture, and shadow.'];
function newChallenge(){$('challenge').textContent=challenges[Math.floor(Math.random()*challenges.length)]}
$('challengeBtn').onclick=newChallenge;newChallenge();

fetch('data/recipes.json').then(r=>r.json()).then(data=>{
 recipes=data;
 [...new Set(recipes.map(r=>r.collection))].forEach(c=>$('collection').insertAdjacentHTML('beforeend',`<option>${c}</option>`));
 render();$('findBtn').click();
}).catch(()=>{$('recipeGrid').innerHTML='<p>Recipe data could not load. Open this app through a local web server rather than directly from the file system.</p>'});

if('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('service-worker.js'));
