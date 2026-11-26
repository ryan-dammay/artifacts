# COACH Contextual Search

Recommended design for contextual search on coach.ae (desktop 1440px and 992px, and mobile), with clickable prototypes.

Page: https://ryan-dammay.github.io/artifacts/coach-contextual-search/

## Files

- `index.html` – the gallery: every board, scaled to fit, with a link to open each at full size.
- `boards/*.html` – one standalone page per board. Boards marked Prototype are interactive (search panel, animated
  placeholder, first-visit tip, removable "We understood" tags).
- `source/*.dc.html`, `source/canvas.json` – the boards and canvas layout exactly as they are in the Claude design canvas.
- `source/dc-lite.js` – the small runtime that renders those boards outside Claude (template holes, `sc-if`, `sc-for`,
  event handlers), patching the page with [morphdom](https://github.com/patrick-steele-idem/morphdom) (MIT) so
  animations and input focus survive re-renders.
- `assets/` – the COACH logo and product photos used by the boards.

## Updating

The Claude canvas is the source of truth. To refresh this copy, replace the files in `source/` with the canvas's
current boards and rebuild `boards/` and `index.html` from them.
