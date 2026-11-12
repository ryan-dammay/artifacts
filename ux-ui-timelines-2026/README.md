# 2026 UX/UI Timelines

The team's task timeline for 2026–27 (Ryan, Anjali, Talal) across Gymshark, Mamas & Papas, Coach and Bloomingdale's:
weekly and monthly timeline, work log, KPIs, year-end review and weekly productivity.

It runs in two places:

- the Claude artifact (the original page, where tasks are added and edited), and
- this GitHub Pages copy, read-only: https://ryan-dammay.github.io/artifacts/ux-ui-timelines-2026/

## Files

- `index.html` – the GitHub Pages page: the artifact's page plus `source/github-runtime.js`, which reads the saved data
  instead of the artifact's data store. Built by `sync/export.py`; don't edit it by hand.
- `source/timeline-page.html` – the page as it runs inside the Claude artifact.
- `source/github-runtime.js` – the read-only GitHub runtime.
- `data/tasks.json` – the tasks (`{id, data}`: title, assignee, brand, status, estimated start/end, links, notes, date history).
- `data/kpis.json` – KPI readings.
- `data/people.json` – display names for the people ids in the tasks.
- `data/meta.json` – when the data was saved.
- `sync/export.py` – rebuilds `data/` from an export of the artifact's database and rebuilds `index.html`.

## Updating

Export the artifact's `tasks` and `kpis` collections to JSON files (one per document), then run:

    python3 sync/export.py <tasks-dir> <kpis-dir>

After a change to the page itself, copy it to `source/timeline-page.html` and run `python3 sync/export.py` with no
arguments to rebuild `index.html` only.
