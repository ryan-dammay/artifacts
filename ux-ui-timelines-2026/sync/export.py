"""Rebuilds the GitHub Pages copy of 2026 UX/UI Timelines.

Usage: python3 sync/export.py <dir-with-task-json-files> [<dir-with-kpi-json-files>]
  - Each input directory holds one JSON file per document, named <doc_id>.json
    (as saved by an ArtifactData list with out_dir).
  - Writes data/tasks.json, data/kpis.json and data/meta.json, then rebuilds index.html
    from source/timeline-page.html + source/github-runtime.js.
"""
import json, os, sys, datetime, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent


def read_dir(d):
    rows = []
    if d and os.path.isdir(d):
        for f in sorted(os.listdir(d)):
            if f.endswith(".json"):
                with open(os.path.join(d, f)) as fh:
                    rows.append({"id": f[:-5], "data": json.load(fh)})
    return rows


def build_index():
    page = (ROOT / "source/timeline-page.html").read_text()
    runtime = (ROOT / "source/github-runtime.js").read_text()
    html = (
        '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        "<style>body{margin:0}[hidden]{display:none!important}</style>\n"
        "<script>\n" + runtime + "</script>\n</head>\n<body>\n" + page + "\n</body>\n</html>\n"
    )
    (ROOT / "index.html").write_text(html)


def main():
    tasks_dir = sys.argv[1] if len(sys.argv) > 1 else None
    kpis_dir = sys.argv[2] if len(sys.argv) > 2 else None
    if tasks_dir:
        (ROOT / "data/tasks.json").write_text(json.dumps(read_dir(tasks_dir), indent=1, ensure_ascii=False) + "\n")
        (ROOT / "data/kpis.json").write_text(json.dumps(read_dir(kpis_dir), indent=1, ensure_ascii=False) + "\n")
        now = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
        (ROOT / "data/meta.json").write_text(json.dumps({"snapshotAt": now}, indent=1) + "\n")
    build_index()


if __name__ == "__main__":
    main()
