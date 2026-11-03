# Hoopster Nation Season 7 – Stats Dashboard

Source for the Hoopster Nation S7 dashboard (Game Schedule, Standings, Player stats, TL Corner),
published as a Claude Dashboard artifact.

- `index.html` – the dashboard page. It runs inside the Claude Dashboard artifact runtime
  (it uses the `dash` data API and d3), so opening it straight from GitHub shows an empty shell.
- `data/` – saved copies of the public data (schedule, box scores, rosters, Players of the Game, standings).
- `sync/` – the scripts the scheduled sync uses:
  - `public_sync.py` turns the league Google Sheet tabs into the saved copies.
  - `tl_sync.py` builds the TL Corner fee data and seals it with a public key (no password inside).

Live data comes from the league Google Sheet ("Hoopster Nation Season 7 – Teams (Live)").
Not in this repo: player photos and the TL Corner fee data.
