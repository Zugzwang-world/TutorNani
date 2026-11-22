#!/usr/bin/env python3
"""Sum Claude Code tokens for this project since T0, from local transcripts (~/.claude/projects). Usage: python3 .claude/usage-tokens.py [T0-iso-utc]"""
import glob, json, os, sys
t0 = sys.argv[1] if len(sys.argv) > 1 else "2026-11-16T19:38:00"
seen, tot = set(), {"input": 0, "output": 0, "cache_write": 0, "cache_read": 0}
by_model = {}
files = [f for d in glob.glob(os.path.expanduser("~/.claude/projects/-Users-hrishikesh-TutorNani*")) for f in glob.glob(d + "/**/*.jsonl", recursive=True)]
for f in files:
    with open(f, errors="ignore") as fh:
        for line in fh:
            try:
                j = json.loads(line)
            except Exception:
                continue
            if j.get("type") != "assistant" or (j.get("timestamp") or "") < t0:
                continue
            m = j.get("message") or {}
            u = m.get("usage") or {}
            k = (m.get("id"), j.get("requestId"))
            if not u or k in seen:
                continue
            seen.add(k)
            vals = {"input": u.get("input_tokens", 0), "output": u.get("output_tokens", 0),
                    "cache_write": u.get("cache_creation_input_tokens", 0), "cache_read": u.get("cache_read_input_tokens", 0)}
            for a, b in vals.items():
                tot[a] += b or 0
            mm = by_model.setdefault(m.get("model", "?"), 0)
            by_model[m.get("model", "?")] = mm + (vals["output"] or 0) + (vals["input"] or 0) + (vals["cache_write"] or 0)
print(json.dumps({"since": t0, "files": len(files), "calls": len(seen), **tot, "fresh_tokens_by_model": by_model}))
