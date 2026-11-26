# Bloomingdale's Contextual Search

Contextual search for bloomingdales.ae (desktop 1440px and mobile 375px), built from the BLM Design System and the
BLMHW Sprint 2 search designs, with clickable prototypes.

Page: https://ryan-dammay.github.io/artifacts/blm-contextual-search/

## Files

- `index.html` – the gallery: every board, scaled to fit, with a link to open each at full size.
- `boards/*.html` – one standalone page per board:
  - `Main` – desktop header: animated placeholder, first-visit tip, sparkles.
  - `SearchModal` – desktop search modal: contextual-search explainer and Try examples, live highlighting of typed
    words in Results and Designers, recent / trending logic, no-results state, open and close animation, and
    "Goes to results page" tooltips on links and Enter.
  - `MobileSearch` – mobile homepage header with first-visit tip, and the search sheet with the same logic.
- `source/*.dc.html`, `source/canvas.json` – the boards and canvas layout exactly as they are in the Claude design
  canvas (image paths there point at the canvas's own uploads; the boards here use `assets/`).
- `source/dc-lite.js` – the small runtime that renders those boards outside Claude (template holes, `sc-if`, `sc-for`,
  event handlers), patching the page with [morphdom](https://github.com/patrick-steele-idem/morphdom) (MIT) so
  animations and input focus survive re-renders.
- `assets/` – the Bloomingdale's logo and icons exported from the BLM Design System and Sprint 2 Figma files.

## Updating

The Claude canvas is the source of truth. To refresh this copy, replace the files in `source/` with the canvas's
current boards and rebuild `boards/` and `index.html` from them.
