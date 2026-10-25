# Brackettier

Browser-only tournament bracket maker. Vanilla HTML, CSS, and JavaScript — no build step.

**Live:** [https://vicholz.github.io/brackettier/](https://vicholz.github.io/brackettier/)

**Demo link:** [https://vicholz.github.io/brackettier/#demo](https://vicholz.github.io/brackettier/#demo) — on load (or when the hash becomes `#demo`), seeds 12 whimsical names into a 1v1 “Whimsy Cup” bracket (replaces local data; no confirm). The `#demo` hash stays so refresh and the header **DEMO** link (`href="#demo"`) keep working; click DEMO again while already on `#demo` re-runs the seed.

## Open locally

Any static file server works. From this directory:

```bash
python3 -m http.server 8080
```

Then open [http://localhost:8080](http://localhost:8080).

Or open `index.html` directly in a modern browser (ES modules + `localStorage`). A local server is preferred so share links and module loading behave consistently.

## Features

- **People** — shared name pool; create, edit, remove
- **Named brackets** — multiple brackets, each with its own team size (1v1–5v5)
- **Play** — assign people to first-round slots (or **Auto assign** / confirmable **Reshuffle**), pick winners; later rounds fill automatically until a champion
- **Responsive + print** — phone/tablet/desktop layouts; Print hides chrome and keeps the bracket structure
- **Persistence** — full state in `localStorage` (`brackettier:v1`), auto-saved on change
- **JSON import / export / share**
  - Download or copy JSON
  - Import from file or paste (**replace** is the default; optional **merge** by id)
  - Share link embeds gzip-compressed state in the URL hash (`#bt=…`); if too large, copy JSON instead

## Project layout

```
index.html
css/styles.css
js/app.js
js/storage.js
js/bracket.js
js/share.js
```
