#!/usr/bin/env python3
# Hoopster S7: turns five public sheet reads into the dashboard's saved copies (used when the live sheet can't be read).
# Usage: python3 public_sync.py schedule.json stats.json roster.json potg.json standings.json OUTDIR
import sys, json, os, re, datetime
def vals(p):
    a = json.load(open(p))
    if isinstance(a, dict) and 'content' in a and 'values' not in a:
        a = json.loads(next(c['text'] for c in a['content'] if c.get('type') == 'text'))
    return [((r or []) + [''] * 20) for r in a['values'][1:] if r and any(str(c).strip() for c in r)]
def n(v):
    s = str(v).replace(',', '').strip()
    try: return int(float(s)) if s else 0
    except ValueError: return 0
sch, st, ro, po, sd = (vals(p) for p in sys.argv[1:6]); out = sys.argv[6]; os.makedirs(out, exist_ok=True)
schedule, rd, dt = [], '', ''
for r in sch:
    if not str(r[2]).strip(): continue
    if str(r[0]).strip(): rd, dt = str(r[0]).strip(), re.sub(r'\s*\(played\)\s*', '', str(r[1]), flags=re.I).strip()
    schedule.append({'round': rd, 'date': dt, 'game': str(r[2]).strip(), 'time': r[3], 'home': r[4], 'home_tl': r[5], 'away': r[7], 'venue': r[9], 'map': r[10], 'home_score': r[11], 'away_score': r[12]})
box, seen = [], {}
for r in st:
    if not (str(r[0]).strip() and str(r[5]).strip()): continue
    k = r[0] + '|' + r[3]; seen[k] = seen.get(k, 0) + 1
    m = re.search(r'Team\s*(\d+)', r[2], re.I); dnp = str(r[8]).strip().lower() == 'dnp'
    box.append({'game': r[0].strip(), 'team': r[3], 'team_no': int(m.group(1)) if m else None, 'line': seen[k], 'player': r[5].strip(), 'jersey': r[6], 'rating': r[7],
                'played': 'DNP' if dnp else 'Yes', **{f: (0 if dnp else n(r[9 + i])) for i, f in enumerate(['pts', 'reb', 'ast', 'stl', 'blk'])}})
roster = [{'team_no': n(r[0]), 'team': r[1], 'player': r[2].strip(), 'jersey': r[4], 'rating': r[3], 'role': r[5]} for r in ro if str(r[2]).strip()]
awards = [{'round': str(r[0]).strip(), 'game': str(r[1]).strip(), 'player': r[2].strip(), 'team': r[3], **{f: (n(r[4 + i]) if str(r[4 + i]).strip() else None) for i, f in enumerate(['pts', 'reb', 'ast', 'stl', 'blk'])}} for r in po if str(r[2]).strip()]
standings = [{'as_of': r[0], 'rank': n(r[1]), 'team': r[2], 'tl': r[3], 'round': n(r[4]), 'result': r[5], 'points': n(r[6])} for r in sd if str(r[2]).strip()]
warn = []
if len(schedule) < 40: warn.append('schedule has only %d games' % len(schedule))
if len(roster) < 90: warn.append('roster has only %d players' % len(roster))
if not box: warn.append('no game stats rows')
files = {'schedule.json': schedule, 'boxscores.json': box, 'roster.json': roster, 'awards.json': awards, 'standings.json': standings}
for f, d in files.items(): json.dump(d, open(os.path.join(out, f), 'w'), ensure_ascii=False)
now = datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0)
json.dump([{'updated_at': now.isoformat().replace('+00:00', 'Z'), 'what': 'Scheduled sync from the league sheet'}], open(os.path.join(out, 'last_update.json'), 'w'))
print(json.dumps({'games': len(schedule), 'stat_rows': len(box), 'players': len(roster), 'potg': len(awards), 'standings_rows': len(standings),
                  'ok_to_upload': not warn, 'warnings': warn}))
