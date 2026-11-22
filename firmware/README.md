# Firmware

**Status: experimental. Not used in the demo**, where Nani runs in the browser (`/toy` and `/stage`) on the same toy contract ([docs/toy-contract.md](../docs/toy-contract.md)).

What is here is our own small firmware, not a fork:
- [`nani-toy/nani-full/`](nani-toy/nani-full/): an ESP32-S3 Arduino sketch. A push switch wakes Nani; the mic records what the child says, sends it over Wi-Fi, and plays Nani's answer sentence by sentence.
- [`nani-toy/brain/nani_brain.py`](nani-toy/brain/nani_brain.py): the laptop bridge between the toy and the Nani website, started with `start-nani.sh` (macOS) or `start-nani.bat` (Windows). Its `--site` still defaults to tutor-grandma.vercel.app, the old stack.

How to wire, flash and run it: [nani-toy/README.md](nani-toy/README.md).
