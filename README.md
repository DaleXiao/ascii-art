# ascii-art

Any image → ASCII art. Pure front-end, terminal-style web app: your images never leave the browser — no uploads, no backend, no external requests at runtime.

## Features

- **Conversion core** — canvas downsampling + luminance→character ramp (`@%#*+=-:. `) + saturation boost + highlight clamp, auto-width heuristic
- **Render output** — color (sampled from the source image) / monochrome (theme ink) modes, PNG download + TXT copy
- **Terminal UI** — dark (phosphor green + scanlines) / light (paper-white ink) themes, follows the system + manual toggle + persistence
- **i18n** — Chinese / English toggle, defaults to the browser language
- **Input** — drag & drop / file picker / clipboard paste

## Develop

No build step, vanilla JS ESM.

```bash
python3 -m http.server 8080   # open http://localhost:8080
npm test                      # node --test
```

## Layout

```
index.html      entry point
css/style.css   terminal theme styles
js/ascii-core.js  pure-function conversion core (no DOM deps, unit-testable)
js/render.js      canvas rendering + PNG/TXT output
js/i18n.js        zh/en copy dictionaries
js/input.js       drag & drop / picker / paste
js/app.js         UI assembly
test/             node --test unit tests
docs/screenshots/ UI screenshots
```

Spec: SPEC-420 (issue #1) · Task: T-719
