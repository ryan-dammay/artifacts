# Hoopster Nation Season 7 – Stats Dashboard

Source for the Hoopster Nation S7 dashboard (Game Schedule, Standings, Player stats, TL Corner),
published as a Claude Dashboard artifact.

- `index.html` – stand-alone copy for GitHub Pages (https://ryan-dammay.github.io/artifacts/): the same page with a small
  built-in runtime that reads the saved files in `data/`. It has the schedule, standings and player stats; the TL Corner
  stays on the private Claude dashboard.
- `source/dashboard-page.html` – the page as it runs inside the Claude Dashboard artifact (uses its `dash` data API).
- `fonts/` – Oswald and Barlow (SIL Open Font License).
- `data/` – saved copies of the public data (schedule, box scores, rosters, Players of the Game, standings).
- `sync/` – the scripts the scheduled sync uses:
  - `public_sync.py` turns the league Google Sheet tabs into the saved copies.
  - `tl_sync.py` builds the TL Corner fee data and seals it with a public key (no password inside).

Live data comes from the league Google Sheet ("Hoopster Nation Season 7 – Teams (Live)").
Not in this repo: player photos and the TL Corner fee data.
