#!/usr/bin/env python3
"""2027 Roadmap: two-way sync between the Claude artifact's projects and this folder's data/items.json.

Edits can be made in the Claude artifact or on the GitHub Pages copy. For each project the side that changed
since the last sync wins; if both changed, the newer change wins. Deletions on either side are carried over.

  two_way.py check META_IN
      Prints {"needed": true|false}: false when neither side has changed since the last sync.

  two_way.py run ITEMS_JSONL EXPECTED_COUNT META_IN OUT_DIR
      ITEMS_JSONL   one line per Claude document, as ArtifactData "list" prints it:
                    {"id": ..., "data": {...}, "version": N, "updatedAt": "ISO time"}
      META_IN       {"lastUpdated": <ms>, "summary": "...", "version": N} from the artifact's meta/info document
      Writes data/items.json, data/meta.json and data/sync-state.json, plus OUT_DIR/to_claude.json: the writes to
      apply to the Claude artifact with ArtifactData "batch" (entries already in batch format; each "set" entry
      points at a JSON file in OUT_DIR through file_path). Prints a short summary.
"""
import hashlib, json, os, pathlib, sys, time
from datetime import datetime

DATA = pathlib.Path(__file__).resolve().parent.parent / "data"
ITEMS, META, STATE = DATA / "items.json", DATA / "meta.json", DATA / "sync-state.json"


def canon(d):
    return json.dumps(d, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def h(d):
    return hashlib.sha256(canon(d).encode("utf-8")).hexdigest()


def file_hash(p):
    return hashlib.sha256(p.read_bytes()).hexdigest() if p.exists() else ""


def load(p, default):
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return default


def iso_ms(s):
    try:
        return int(datetime.fromisoformat(str(s).replace("Z", "+00:00")).timestamp() * 1000)
    except ValueError:
        return 0


def gh_time(d):
    t = d.get("updatedAt")
    return t if isinstance(t, (int, float)) else 0


def check(meta_in):
    st = load(STATE, {})
    m = json.load(open(meta_in, encoding="utf-8"))
    needed = (m.get("lastUpdated") != st.get("claudeMeta")) or (file_hash(ITEMS) != st.get("itemsHash"))
    print(json.dumps({"needed": needed}))


def run(jsonl, expected, meta_in, out_dir):
    out_dir = pathlib.Path(out_dir); out_dir.mkdir(parents=True, exist_ok=True)
    claude = {}
    for n, line in enumerate(open(jsonl, encoding="utf-8"), 1):
        line = line.strip()
        if not line:
            continue
        o = json.loads(line)
        d = o.get("data")
        if not o.get("id") or not isinstance(d, dict):
            sys.exit(f"line {n}: missing id or data")
        if not isinstance(d.get("title"), str) or not d.get("lane"):
            sys.exit(f"line {n}: {o['id']} has no title or lane")
        if o["id"] in claude:
            sys.exit(f"line {n}: duplicate id {o['id']}")
        claude[o["id"]] = {"data": d, "version": o.get("version"), "t": iso_ms(o.get("updatedAt"))}
    if len(claude) != expected:
        sys.exit(f"expected {expected} projects, got {len(claude)}")

    meta_c = json.load(open(meta_in, encoding="utf-8"))
    st = load(STATE, {})
    seen = st.get("items", {})
    gh, tomb = {}, {}
    for r in load(ITEMS, []):
        if r.get("deleted"):
            tomb[r["id"]] = r.get("deletedAt") or 0
        elif isinstance(r.get("data"), dict):
            gh[r["id"]] = r["data"]

    final, writes, notes = {}, [], []

    def to_claude_set(i, data):
        f = out_dir / f"{i}.json"
        f.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        w = {"op": "set", "collection": "items", "doc_id": i, "file_path": str(f)}
        if i in claude and claude[i]["version"] is not None:
            w["if_version"] = claude[i]["version"]
        writes.append(w)

    for i in sorted(set(claude) | set(gh) | set(tomb)):
        c, g, s = claude.get(i), gh.get(i), seen.get(i)
        if c and g is not None:
            hc, hg = h(c["data"]), h(g)
            if hc == hg:
                final[i] = c["data"]
                continue
            c_changed, g_changed = hc != s, hg != s
            if g_changed and (not c_changed or gh_time(g) > c["t"]):
                final[i] = g; to_claude_set(i, g); notes.append("GitHub → Claude: " + g.get("title", i))
            else:
                final[i] = c["data"]; notes.append("Claude → GitHub: " + c["data"].get("title", i))
        elif c:
            if i in tomb and s is not None:
                if h(c["data"]) != s and c["t"] > tomb[i]:
                    final[i] = c["data"]  # edited in Claude after it was deleted on GitHub: keep it
                else:
                    w = {"op": "delete", "collection": "items", "doc_id": i}
                    if c["version"] is not None:
                        w["if_version"] = c["version"]
                    writes.append(w); notes.append("Deleted in Claude (removed on GitHub): " + c["data"].get("title", i))
            else:
                final[i] = c["data"]
                if s is None:
                    notes.append("Claude → GitHub (new): " + c["data"].get("title", i))
        elif g is not None:
            if s is not None and h(g) == s:
                notes.append("Removed on GitHub (deleted in Claude): " + g.get("title", i))
            else:
                final[i] = g; to_claude_set(i, g)
                notes.append(("GitHub → Claude (new): " if s is None else "GitHub → Claude (restored): ") + g.get("title", i))
        # tombstone only: nothing to keep

    now = int(time.time() * 1000)
    claude_meta = meta_c.get("lastUpdated")
    summary = meta_c.get("summary", "")
    if writes:
        gh_changes = [n for n in notes if n.startswith("GitHub") or n.startswith("Deleted in Claude")]
        summary = "Synced from GitHub: " + "; ".join(x.split(": ", 1)[1] for x in gh_changes[:3]) + ("…" if len(gh_changes) > 3 else "")
        claude_meta = now
        mw = {"op": "set", "collection": "meta", "doc_id": "info", "data": {"lastUpdated": now, "summary": summary}}
        if meta_c.get("version") is not None:
            mw["if_version"] = meta_c["version"]
        writes.append(mw)

    rows = [{"id": i, "data": final[i]} for i in sorted(final)]
    newest = max([claude_meta or 0] + [gh_time(d) for d in final.values()])
    ITEMS.write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    META.write_text(json.dumps({"lastUpdated": newest, "summary": summary}, ensure_ascii=False, indent=1), encoding="utf-8")
    STATE.write_text(json.dumps({"claudeMeta": claude_meta, "itemsHash": file_hash(ITEMS), "syncedAt": now,
                                 "items": {i: h(final[i]) for i in sorted(final)}}, ensure_ascii=False, indent=1), encoding="utf-8")
    (out_dir / "to_claude.json").write_text(json.dumps(writes, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps({"projects": len(rows), "to_claude": len(writes), "changes": notes}, ensure_ascii=False))


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "check":
        check(sys.argv[2])
    elif len(sys.argv) >= 6 and sys.argv[1] == "run":
        run(sys.argv[2], int(sys.argv[3]), sys.argv[4], sys.argv[5])
    else:
        sys.exit(__doc__)
