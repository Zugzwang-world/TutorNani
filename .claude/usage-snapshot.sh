#!/bin/bash
# Status line: records the weekly usage % to .claude/usage-now.json (gitignored) and prints one short line.
DIR="$(cd "$(dirname "$0")" && pwd)"
IN="$(cat)"
W="$(printf '%s' "$IN" | jq -r '.rate_limits.seven_day.used_percentage // empty' 2>/dev/null)"
NOW="$(date +%s)"
if [ -n "$W" ]; then
  printf '{"weekly": %s, "at": %s}\n' "$W" "$NOW" > "$DIR/usage-now.json"
  printf 'week %s%%\n' "$W"
else
  printf '{"weekly": null, "at": %s}\n' "$NOW" > "$DIR/usage-now.json"
  printf 'week ?\n'
fi
