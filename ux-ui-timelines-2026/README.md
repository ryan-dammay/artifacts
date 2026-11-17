# 2026 UX/UI Timelines

The team's task timeline for 2026–27 (Ryan, Anjali, Talal) across Gymshark, Mamas & Papas, Coach and Bloomingdale's:
weekly and monthly timeline, work log, KPIs, year-end review and weekly productivity.

It runs in two places that stay in step:

- the Claude artifact (the original page), and
- this GitHub Pages copy: https://ryan-dammay.github.io/artifacts/ux-ui-timelines-2026/

## Files

- `index.html` – the GitHub Pages page: the artifact's page plus `source/github-runtime.js`, which stands in for the
  artifact's data store. Built by `sync/export.py`; don't edit it by hand.
- `source/timeline-page.html` – the page as it runs inside the Claude artifact.
- `source/github-runtime.js` – the GitHub runtime (log in, saving to GitHub, owner setup).
- `data/tasks.json`, `data/kpis.json` – the tasks and KPI readings (`{id, data}`). Deleted ones stay as
  `{"id", "deleted": true}` until the next sync carries the deletion over.
- `data/people.json` – display names for the people ids in "added by" and the date history.
- `data/edit-key.json` – the GitHub token, encrypted separately with each person's edit password
  (PBKDF2-SHA256, 600k rounds, AES-GCM). Created from the page itself; passwords are never stored.
- `data/meta.json` – when the data last changed through a sync.
- `data/sync-state.json` – what the last sync saw, so the next one knows which side changed.
- `sync/two_way.py` – the two-way sync the hourly scheduled task runs.
- `sync/export.py` – rebuilds `index.html` (run with no arguments after copying a new page into `source/`).

## Editing on GitHub

Ryan, Anjali and Talal each have their own edit password. **Log in to edit** at the top right, pick your name and enter
your password. The rights match the Claude artifact: Ryan (admin) can change everything; Anjali and Talal can add tasks,
edit the tasks they added or that are assigned to them (including ones Ryan created for them), and delete the tasks
they added. Each save is a commit to `data/tasks.json` on `main`; GitHub Pages shows it
about a minute later. Like in Claude, these rights are enforced by the page, so they rely on trust within the team.

One-time setup (Ryan): create a GitHub fine-grained personal access token for this repository only, with
**Contents: Read and write** and nothing else (the 2027 Roadmap's token works too: in a browser where you're logged in
to the Roadmap's admin, leave the token field empty). Open the page with `#setup-editing` at the end of the address,
then set a password for each person (leave one empty to give that person no access). To change passwords later, log in
as Ryan and open `#setup-editing` again: empty fields keep the current passwords.

## Sync with Claude

An hourly scheduled task runs `sync/two_way.py`. For each task, the side that changed since the last sync wins; if both
changed the same task, the Claude version wins and the task's report says so. Tasks added or deleted on either side are
added or deleted on the other.
