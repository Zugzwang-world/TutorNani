# Nani toy — run it on your hardware

All commands below run from this folder (`firmware/nani-toy/`).

Code for the Nani plush toy (ESP32-S3). The toy listens, sends speech over Wi-Fi to a laptop, and plays
Nani's answers from the Tutor Grandma website. 

## 1. Wiring (ESP32-S3-DevKitC-1 N16R8)

| Part | Pin | ESP32-S3 |
|---|---|---|
| I2S mic (INMP441 / ICS-43434) | VDD / GND | **3V3** / GND |
| | SCK / WS / SD | GPIO 4 / 5 / 6 |
| | L/R | GND |
| MAX98357A amp | VIN / GND | **5V** / GND |
| | BCLK / LRC / DIN / SD | GPIO 15 / 16 / 17 / 18 |
| Speaker (3 W, 4 Ω) | + / − | amp screw terminals only |
| 1000 µF capacitor | + / − (stripe) | amp VIN / amp GND, close to the amp |
| Latching push switch | middle pin of one row / an outer pin | GPIO 2 / GND |
| RGB LED eyes (optional) | left R/G/B, right R/G/B | GPIO 9/10/11, 12/13/14 (220 Ω each) |

## 2. Put in your Wi-Fi

Windows:
```powershell
copy nani-full\secrets.example.h nani-full\secrets.h
notepad nani-full\secrets.h
```
macOS (Terminal):
```bash
cp nani-full/secrets.example.h nani-full/secrets.h
open -e nani-full/secrets.h
```
Set `WIFI_SSID` and `WIFI_PASS`. **2.4 GHz network only** (the ESP32 can't see "..._5G" networks).
`secrets.h` is git-ignored, so your password never goes to GitHub.

## 3. Flash the toy (Arduino IDE 2.x, board package "esp32 by Espressif" 3.x)

Open `nani-full/nani-full.ino`, then **Tools**:

| Setting | Value |
|---|---|
| Board | ESP32S3 Dev Module |
| USB CDC On Boot | **Enabled** |
| PSRAM | **OPI PSRAM** |
| Port | your board's port: `COMx` on Windows, `/dev/cu.usbmodem…` on macOS |

Upload. Serial Monitor at **115200** should show `Mic: OK  Amp: OK`, `Wi-Fi: connected`, and
`Nani is ASLEEP`.

## 4. Run the laptop bridge (same Wi-Fi as the toy)

**Windows**, once:
```powershell
pip install -r requirements.txt
```
Needs Python 3.10+, **ffmpeg** on PATH, and Microsoft Edge or Google Chrome.
Every time: double-click **`start-nani.bat`**.

**macOS**, once (Terminal, in this folder):
```bash
brew install ffmpeg            # needs Homebrew: https://brew.sh
python3 -m pip install -r requirements.txt
chmod +x start-nani.sh
```
Needs Python 3.10+ and Google Chrome (or run `python3 -m playwright install chromium` once instead).
Every time: `./start-nani.sh`. If macOS asks to allow incoming network connections for Python, click **Allow**.

The bridge finds the toy on the Wi-Fi by itself. Wait for `Connected. Talk to Nani!`, then **press the
toy's switch** and talk.

| Eyes | Meaning |
|---|---|
| blue | listening |
| purple | thinking ("Hmm, let me think!") |
| red | speaking |

Serial Monitor keys: `+` / `-` volume, `g` greeting, `w` wake/sleep, `d` mic level, `a` flip LED type.

## 5. If something is wrong

| Problem | Fix |
|---|---|
| Compile error about USB CDC | Tools → USB CDC On Boot → Enabled |
| `secrets.h: No such file` | do step 2 |
| `Wi-Fi: failed` | use the 2.4 GHz network; check the password |
| Upload can't connect | hold BOOT, tap RESET, release BOOT, upload again |
| Upload says port busy | close the Serial Monitor |
| Bridge says `not found yet` | toy and laptop must be on the same Wi-Fi |
| Toy says "Wait beta, I am waking up!" | start the bridge (`start-nani.bat` / `./start-nani.sh`) |
| Mac: `permission denied: ./start-nani.sh` | run `chmod +x start-nani.sh` once |
| Mac: `Website mirror stopped: no browser found` | install Google Chrome, or `python3 -m playwright install chromium` |
| Crackle when loud | press `-` in the Serial Monitor; check the capacitor |
