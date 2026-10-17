#!/usr/bin/env python3
"""Sync the page's queue events into a sheet's progress log and put each video's lines in the right order.

usage: python finalize_log.py <Root> [--submitted "n1,n2,..."] [--run "<run name>"]

<Root> is the sheet folder (contains logs/). Why this exists: in queue mode the page records `submitting`/`submitted`
only in window.__Q.ev, while the mover writes `downloaded`/`moved` as soon as the file arrives, so a late sync would put
`submitted` AFTER `moved` and make the status look wrong (status = last line of a video).
  --submitted  names whose `submitting`+`submitted` lines are missing (take them from getQueueStatus(0).ev, status 'submitted').
This script adds the missing lines, then rewrites the log sorted per video: submitting/redo -> submitted/failed -> downloaded -> moved.
Prints the final status counts. Run it when a sheet ends (or stops), then use progress.ps1 -Show (from inside <Root>) to check.
"""
import glob, json, sys, datetime, os
from collections import Counter

root = sys.argv[1]
names = []
if "--submitted" in sys.argv:
    names = [x for x in sys.argv[sys.argv.index("--submitted") + 1].split(",") if x]
files = glob.glob(os.path.join(root, "logs", "progress.*.jsonl"))
if not files:
    sys.exit("no progress.*.jsonl in %s/logs" % root)
f = files[0]
rows = [json.loads(l) for l in open(f, encoding="utf-8") if l.strip()]
order, by = [], {}
for r in rows:
    by.setdefault(r["video"], []).append(r)
    if r["video"] not in order:
        order.append(r["video"])
now = datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")
for v in names:
    if v not in by:
        by[v] = []; order.append(v)
    have = {r["status"] for r in by[v]}
    for s in ("submitting", "submitted"):
        if s not in have:
            d = {"video": v, "status": s, "t": now}
            if s == "submitted":
                d["note"] = "agent mode, duration unknown"
            by[v].append(d)
rank = {"submitting": 0, "redo": 0, "submitted": 1, "failed": 1, "downloaded": 2, "moved": 3}
out = []
for v in sorted(order, key=lambda x: min(r["t"] for r in by[x])):
    seen = set()
    for r in sorted(by[v], key=lambda r: (rank.get(r["status"], 1), r["t"])):
        if r["status"] in seen and r["status"] != "failed":
            continue
        seen.add(r["status"]); out.append(r)
open(f, "w", encoding="utf-8").write("".join(json.dumps(r, ensure_ascii=False, separators=(",", ":")) + "\n" for r in out))
last = {}
for r in out:
    last[r["video"]] = r["status"]
print(len(last), dict(Counter(last.values())))
