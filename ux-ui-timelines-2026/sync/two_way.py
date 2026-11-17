#!/usr/bin/env python3
"""2026 UX/UI Timelines: two-way sync between the Claude artifact's database and this folder's data files.

Tasks (and KPI readings) can be added, edited and deleted in the Claude artifact or on the GitHub Pages copy.
For each document, the side that changed since the last sync wins. If both sides changed the same document,
the Claude version wins and the change list says so. A deletion on either side always wins: it is carried over to
the other side even if someone edited that task there since the last sync, so a deleted task disappears for everyone.

  two_way.py run TASKS_DIR TASKS_COUNT KPIS_DIR KPIS_COUNT OUT_DIR
      TASKS_DIR / KPIS_DIR  either a folder with one <doc_id>.json file per Claude document, holding the document's
                            data (as an ArtifactData "list" with out_dir saves them), or a .jsonl file with one
                            {"id", "data", ...} object per line (as db_list prints them). A missing path means none.
      *_COUNT               how many documents the list said it saved, as a check.
      Writes data/tasks.json, data/kpis.json, data/meta.json and data/sync-state.json, and OUT_DIR/to_claude.json:
      the writes to make in the Claude artifact, each
        {"op": "set"|"delete", "collection", "doc_id", "exists": bool, "file_path"?: <JSON file with the data>}
      ("exists": true means the document is already in Claude, so the write needs its current version).
      Prints {"tasks", "kpis", "to_claude", "changes"}.
"""
import hashlib, json, os, pathlib, sys, time
from datetime import datetime, timezone

DATA = pathlib.Path(__file__).resolve().parent.parent / "data"
STATE, META = DATA / "sync-state.json", DATA / "meta.json"
COLLS = ("tasks", "kpis")


def canon(d):
    return json.dumps(d, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def h(d):
    return hashlib.sha256(canon(d).encode("utf-8")).hexdigest()


def load(p, default):
    try:
        return json.loads(pathlib.Path(p).read_text(encoding="utf-8"))
    except FileNotFoundError:
        return default


def read_claude(folder, expected, coll):
    docs = {}
    if folder and os.path.isfile(folder):  # a .jsonl file: one {"id", "data", ...} object per line
        for n, line in enumerate(open(folder, encoding="utf-8"), 1):
            line = line.strip()
            if not line:
                continue
            try:
                o = json.loads(line)
            except ValueError:
                sys.exit(f"{coll} line {n}: not valid JSON")
            if not o.get("id") or not isinstance(o.get("data"), dict):
                sys.exit(f"{coll} line {n}: missing id or data")
            if o["id"] in docs:
                sys.exit(f"{coll} line {n}: duplicate id {o['id']}")
            docs[o["id"]] = o["data"]
    elif folder and os.path.isdir(folder):
        for f in sorted(os.listdir(folder)):
            if f.startswith(".") or not f.endswith(".json"):
                continue
            d = load(os.path.join(folder, f), None)
            if isinstance(d, dict) and isinstance(d.get("data"), dict) and set(d) <= {"id", "data", "version", "updatedAt"}:
                d = d["data"]  # also accept {"id", "data", ...} wrappers
            if not isinstance(d, dict):
                sys.exit(f"{coll}/{f}: not a JSON object")
            if coll == "tasks" and not isinstance(d.get("title"), str):
                sys.exit(f"{coll}/{f}: task has no title")
            docs[f[:-5]] = d
    if len(docs) != expected:
        sys.exit(f"expected {expected} {coll}, found {len(docs)} files in {folder}")
    return docs


def label(d, i):
    return d.get("title") or d.get("kpi") or i


def run(tasks_dir, tasks_n, kpis_dir, kpis_n, out_dir):
    out = pathlib.Path(out_dir); out.mkdir(parents=True, exist_ok=True)
    st = load(STATE, {})
    writes, notes, counts, new_state = [], [], {}, {}
    for coll, folder, n in (("tasks", tasks_dir, tasks_n), ("kpis", kpis_dir, kpis_n)):
        claude = read_claude(folder, n, coll)
        seen = st.get(coll, {})
        gh, tomb = {}, {}
        for r in load(DATA / f"{coll}.json", []):
            if r.get("deleted"):
                tomb[r["id"]] = r.get("deletedAt") or 0
            elif isinstance(r.get("data"), dict):
                gh[r["id"]] = r["data"]
        final = {}

        def to_claude(i, data, exists):
            f = out / f"{coll}--{i}.json"
            f.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
            writes.append({"op": "set", "collection": coll, "doc_id": i, "exists": exists, "file_path": str(f)})

        for i in sorted(set(claude) | set(gh) | set(tomb)):
            c, g, s = claude.get(i), gh.get(i), seen.get(i)
            if c is not None and g is not None:
                hc, hg = h(c), h(g)
                if hc == hg:
                    final[i] = c
                elif hg != s and hc == s:
                    final[i] = g; to_claude(i, g, True); notes.append("GitHub → Claude: " + label(g, i))
                else:
                    final[i] = c
                    notes.append(("Both changed, kept Claude's: " if hg != s and s is not None else "Claude → GitHub: ") + label(c, i))
            elif c is not None:
                if i in tomb:
                    # deleted on GitHub: delete it in Claude too, even if it was edited there since
                    writes.append({"op": "delete", "collection": coll, "doc_id": i, "exists": True})
                    notes.append("Deleted in Claude (removed on GitHub): " + label(c, i))
                else:
                    final[i] = c
                    if s is None:
                        notes.append("Claude → GitHub (new): " + label(c, i))
            elif g is not None:
                if s is not None:
                    # was in Claude at the last sync and is gone now: deleted in Claude, so remove it here too
                    notes.append("Removed on GitHub (deleted in Claude): " + label(g, i))
                else:
                    final[i] = g; to_claude(i, g, False)
                    notes.append(("GitHub → Claude (new): " if s is None else "GitHub → Claude (restored): ") + label(g, i))
            # tombstone only: nothing to keep

        rows = [{"id": i, "data": final[i]} for i in sorted(final)]
        (DATA / f"{coll}.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        new_state[coll] = {i: h(final[i]) for i in sorted(final)}
        counts[coll] = len(rows)

    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    if notes or not META.exists():
        META.write_text(json.dumps({"snapshotAt": now}, indent=1) + "\n", encoding="utf-8")
    if notes or {c: st.get(c, {}) for c in COLLS} != new_state:  # nothing changed: leave the files alone (no empty commits)
        STATE.write_text(json.dumps({"syncedAt": int(time.time() * 1000), **new_state}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    (out / "to_claude.json").write_text(json.dumps(writes, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps({**counts, "to_claude": len(writes), "changes": notes}, ensure_ascii=False))


def init_state():
    """Records the current data files as the last synced state (used once, when the sync is set up)."""
    st = {"syncedAt": int(time.time() * 1000)}
    for coll in COLLS:
        st[coll] = {r["id"]: h(r["data"]) for r in load(DATA / f"{coll}.json", []) if isinstance(r.get("data"), dict)}
    STATE.write_text(json.dumps(st, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(json.dumps({c: len(st[c]) for c in COLLS}))


if __name__ == "__main__":
    a = sys.argv
    if len(a) == 7 and a[1] == "run":
        run(a[2], int(a[3]), a[4], int(a[5]), a[6])
    elif len(a) == 2 and a[1] == "init":
        init_state()
    else:
        sys.exit(__doc__)
