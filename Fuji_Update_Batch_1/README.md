# Fuji Field Companion — Complete Static PWA

A mobile-first Fujifilm X‑T5 companion designed for the XF 16–80mm lens.

## Included

- 130 original X‑T5 recipe starting points
- One processed preview image for every recipe
- Preview/source toggle so you can compare the grade with the ungraded scene
- Smart finder using subject, time, weather, mood, filter, and focal length
- Live weather, sunrise, sunset, and forecast integration through Open‑Meteo
- Editable C1–C7 planner and export
- Favorites, personal recipe notes, and side-by-side comparison
- Custom recipe builder with a live visual approximation
- Interactive X‑T5 control and menu guide
- Learning center and beginner exercises
- Packing lists, shot lists, gear inventory, maintenance reminders, and challenges
- Private local shooting journal with optional compressed thumbnails and statistics
- Browser-side JPEG EXIF reader
- Saved photo-location map
- Full local-data export/import
- Installable PWA and runtime image caching

## Publish to GitHub Pages

Upload **the contents of this folder** to the root of your existing repository. GitHub will replace files with matching names and add the new `assets`, `css`, `js`, and `data` contents. You do not need to delete the working root files first.

After committing, GitHub Pages will rebuild at the same URL. The service worker may briefly show an older version; refresh twice or close and reopen the Home Screen app.

## Important limitations

- Favorites, notes, journal entries, gear, and lists are stored in the current browser. Use Backup Center to move them.
- Weather and maps require an internet connection.
- Preview images are processed approximations, not exact guarantees of how a recipe will render under every light.
- This static GitHub Pages version does not include user accounts or cloud synchronization.

## Local testing

From this folder:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.
