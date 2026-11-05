# 2027 Roadmap

Product & Digital roadmap for 2027 across Mamas & Papas, Gymshark, Coach and Bloomingdale's, with cross-functional and
innovation projects, published as a Claude artifact.

- `index.html` – stand-alone copy for GitHub Pages (https://ryan-dammay.github.io/artifacts/roadmap-2027/): the same page
  with a small built-in runtime that reads the saved files in `data/`. It is read-only: adding, editing, dragging and
  deleting projects only work in the Claude artifact.
- `source/roadmap-page.html` – the page as it runs inside the Claude artifact (uses its `db` and `user` capabilities).
- `data/items.json` – saved copy of the projects (one entry per project: lane, pillar, months, phase, owner, links, notes).
- `data/meta.json` – the "Last updated" note at the time of the snapshot.
- `sync/snapshot.py` – used by the hourly scheduled sync: it turns a listing of the Claude artifact's projects into
  `data/items.json` and `data/meta.json`, and reports whether anything changed.

Edits made in the Claude artifact reach this copy through an hourly scheduled sync, which commits the data files to
`main` only when something changed.

What the page shows:

- A month-by-month 2027 timeline by brand, coloured by pillar (Core Digital, Enterprise Transformation, Innovation & Scale),
  with a red line for today and Omni target dates.
- Each project moves through three phases: UX/UI, Development, Completed.
- Productivity Graph: each Project Owner's projects after UX/UI (Development and Completed).
- UX/UI Graph: Ryan's UX/UI design progress, overall and by brand.

The edit password is never included in this copy.
