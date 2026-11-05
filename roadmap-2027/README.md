# 2027 Roadmap

Product & Digital roadmap for 2027 across Mamas & Papas, Gymshark, Coach and Bloomingdale's, with cross-functional and
innovation projects. It runs in two places that stay in step:

- the Claude artifact (the original page), and
- this GitHub Pages copy: https://ryan-dammay.github.io/artifacts/roadmap-2027/

## Files

- `index.html` – the GitHub Pages page: the artifact's page plus `source/github-runtime.js`, which stands in for the
  artifact's data store.
- `source/roadmap-page.html` – the page as it runs inside the Claude artifact.
- `source/github-runtime.js` – the GitHub runtime (readable copy of the script inlined in `index.html`).
- `data/items.json` – the projects (lane, pillar, months, phase, owner, links, notes). Deleted projects stay here as
  `{"id", "deleted": true}` until the next sync carries the deletion over.
- `data/meta.json` – the "Last updated" note.
- `data/edit-key.json` – a GitHub token encrypted with the edit password (PBKDF2-SHA256, 600k rounds, AES-GCM).
  Created from the page itself; the password is never stored.
- `data/sync-state.json` – what the last sync saw, so the next one knows which side changed.
- `sync/two_way.py` – the two-way sync the hourly scheduled task runs.

## Editing on GitHub

Anyone with the edit password can add, edit, assign (Project Owner), reschedule, reorder, hide and delete projects on the
GitHub page. Each save is a commit to `data/items.json` on `main`; GitHub Pages shows it about a minute later.

One-time setup (owner): create a GitHub fine-grained personal access token for this repository only, with
**Contents: Read and write** and nothing else. Open the page with `#setup-editing` at the end of the address, paste the
token, and enter the edit password twice. To change the password or replace the token, do the same again.

## Sync with Claude

An hourly scheduled task runs `sync/two_way.py`. For each project, the side that changed since the last sync wins; if
both changed, the newer change wins. Projects added or deleted on either side are added or deleted on the other.
