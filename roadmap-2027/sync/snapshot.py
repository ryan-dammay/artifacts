#!/usr/bin/env python3
"""2027 Roadmap: turn a saved listing of the Claude artifact's projects into this folder's data files.

Usage: python3 roadmap-2027/sync/snapshot.py ITEMS_JSONL EXPECTED_COUNT META_JSON_FILE

ITEMS_JSONL     one line per project, as ArtifactData "list" prints it: {"id": ..., "data": {...}, ...}
EXPECTED_COUNT  the number of documents the listing reported
META_JSON_FILE  {"lastUpdated": <ms>, "summary": "..."} from the artifact's meta/info document
Prints {"projects": N, "changed": true|false}. Exits with an error, writing nothing, if the listing looks wrong.
"""
import json, sys, pathlib

base = pathlib.Path(__file__).resolve().parent.parent / "data"
src, expected, meta_file = sys.argv[1], int(sys.argv[2]), sys.argv[3]

rows = []
for n, line in enumerate(open(src, encoding="utf-8"), 1):
    line = line.strip()
    if not line:
        continue
    o = json.loads(line)
    d = o.get("data")
    if not o.get("id") or not isinstance(d, dict):
        sys.exit(f"line {n}: missing id or data")
    if not isinstance(d.get("title"), str) or not d.get("lane"):
        sys.exit(f"line {n}: {o['id']} has no title or lane")
    rows.append({"id": o["id"], "data": d})

ids = [r["id"] for r in rows]
if len(ids) != len(set(ids)):
    sys.exit("duplicate project ids")
if len(rows) != expected:
    sys.exit(f"expected {expected} projects, got {len(rows)}")
rows.sort(key=lambda r: r["id"])

m = json.load(open(meta_file, encoding="utf-8"))
meta = {"lastUpdated": m.get("lastUpdated"), "summary": m.get("summary", "")}

new_items = json.dumps(rows, ensure_ascii=False, indent=1)
new_meta = json.dumps(meta, ensure_ascii=False, indent=1)
old = lambda p: (base / p).read_text(encoding="utf-8") if (base / p).exists() else ""
changed = new_items != old("items.json") or new_meta != old("meta.json")
(base / "items.json").write_text(new_items, encoding="utf-8")
(base / "meta.json").write_text(new_meta, encoding="utf-8")
print(json.dumps({"projects": len(rows), "changed": changed}))
