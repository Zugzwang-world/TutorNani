#!/usr/bin/env bash
# Start Nani's laptop bridge on macOS / Linux (Windows: start-nani.bat).
# First time:  chmod +x start-nani.sh   then run:  ./start-nani.sh
# It finds the toy on the Wi-Fi by itself, answers with the website's Nani and plays website speech.
# Press Ctrl+C twice to stop.
cd "$(dirname "$0")/brain" || exit 1
PY=python3; command -v python3 >/dev/null 2>&1 || PY=python
echo "=================================================="
echo "  Nani's brain is starting. Then press the switch on the toy."
echo "  Ctrl+C to stop (it restarts by itself if it crashes)."
echo "=================================================="
while true; do
  "$PY" nani_brain.py "$@" || true
  echo; echo "Brain stopped. Restarting in 3 seconds... (Ctrl+C again to quit)"
  sleep 3
done
