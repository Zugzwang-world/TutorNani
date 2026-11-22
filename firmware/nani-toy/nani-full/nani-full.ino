// Nani AI voice plush · main firmware (ESP32-S3)
// Board: Tools > Board > "ESP32S3 Dev Module"
//        Tools > USB CDC On Boot > Enabled
//        Tools > PSRAM > "OPI PSRAM" (N16R8 board; gives 8 s recordings and 15 s answers, else 3 s)
// Serial Monitor: 115200
// Wi-Fi: copy secrets.example.h to secrets.h and put your 2.4 GHz network in it.
//
// What it does:
//   Power on   -> ASLEEP (eyes off). Press the on/off switch -> AWAKE: greeting (eyes red), then listening.
//   LISTENING  -> eyes BLUE. The mic listens all the time. When you speak, eyes go bright blue
//                 and it records until you stop (0.7 s of silence).
//   THINKING   -> eyes PURPLE. Instant "Hmm, let me think!" from flash; your words go over Wi-Fi
//                 to the laptop brain (brain/nani_brain.py), which asks the Nani website.
//                 The Serial Monitor prints what you said and Nani's answer.
//   SPEAKING   -> eyes RED. Nani's answer plays sentence by sentence as it arrives, then back to listening.
//   WEBSITE    -> anything Nani says on the website (reminders, songs) is pushed here and played (eyes red).
//   No brain reachable -> "Wait beta, I am waking up!" from flash.
//   Speaker path: 400 Hz bass cut + volume 0.60 (tested clean with a 1000 uF capacitor).
//
// Pins
//   Mic    : SCK 4, WS 5, SD 6, L/R -> GND, VDD -> 3V3
//   Amp    : BCLK 15, LRC 16, DIN 17, SD 18 (or unconnected), VIN -> 5V, GND -> GND, 1000 uF across VIN/GND
//   Eyes   : left R/G/B 9/10/11, right R/G/B 12/13/14 (RGB LEDs through ~220 ohm resistors)
//   Switch : latching push switch, middle pin -> GPIO 2, an outer pin of the same row -> GND.
//            Every press toggles awake/asleep (edge-triggered: the button's position doesn't matter).
//
// Serial Monitor commands (letter + Enter):
//   + / -  volume      g  say the greeting again     w  wake/sleep (like the switch)
//   d  show mic level  a  flip LED type              h  help

#include <Arduino.h>
#include <math.h>
#include <WiFi.h>
#include <ESPmDNS.h>
#include "driver/i2s_std.h"
#include "secrets.h"        // WIFI_SSID / WIFI_PASS (copy secrets.example.h -> secrets.h; never committed)
#include "nani_voice.h"     // greeting; regenerate with: python brain/make_voice.py "new sentence"
#include "nani_filler.h"    // "Hmm, let me think!": make_voice.py "..." --name FILLER
#include "nani_offline.h"   // "Wait beta, I am waking up!": make_voice.py "..." --name OFFLINE

#if !ARDUINO_USB_CDC_ON_BOOT
#error "In Arduino IDE set Tools > USB CDC On Boot > Enabled (otherwise the Serial Monitor shows nothing over USB)"
#endif


// ---------- pins ----------
static const int MIC_SCK = 4, MIC_WS = 5, MIC_SD = 6;
static const int AMP_BCLK = 15, AMP_LRC = 16, AMP_DIN = 17, AMP_SD = 18;
static const int EYE_L[3] = {9, 10, 11};
static const int EYE_R[3] = {12, 13, 14};
static const int SWITCH_PIN = 2;   // latching push switch: middle pin -> GPIO 2, outer pin (same row) -> GND

// ---------- audio ----------
static const uint32_t RATE = 16000;
static const int FRAME = 320;                 // 20 ms
static const int FRAME_MS = 20;
static const int MIC_SHIFT = 14;
static const float HPF_HZ = 400.0f;           // speaker bass cut (tested)
float volume = 0.60f;                         // 0.05 .. 0.8 (0.60 tested clean with the 1000 uF cap; 0.8 = full digital level)

// ---------- voice detection ----------
static const float START_FACTOR = 4.0f;
static const float STOP_FACTOR = 2.5f;
static const float MIN_START_RMS = 300.0f;
static const int END_SILENCE_MS = 700;   // was 900: 0.2 s quicker to notice you've finished
static const int MIN_SPEECH_MS = 300;
static const int PREROLL_FRAMES = 15;
static const float MAX_SECONDS = 8.0f;

static const float MAX_REPLY_SECONDS = 15.0f;  // longest answer (needs PSRAM; 3 s without)
static const uint32_t BRAIN_TIMEOUT_MS = 90000; // give up waiting for the laptop after this

// ---------- state ----------
enum Mode { LISTENING, THINKING, SPEAKING };
Mode mode = LISTENING;
i2s_chan_handle_t micCh = nullptr, ampCh = nullptr;
bool commonAnode = false, debugOn = false, wifiOn = false;
int16_t *recBuf = nullptr;
size_t recMax = 0, recLen = 0;
static int16_t ring[PREROLL_FRAMES * FRAME];
int ringPos = 0, ringCount = 0;
bool inSpeech = false;
int speechMs = 0, silenceMs = 0;
float noiseFloor = 100.0f;
static int32_t micRaw[FRAME];
static int16_t stereo[512];
uint8_t curR = 0, curG = 0, curB = 0;

int16_t *replyBuf = nullptr;
size_t replyMax = 0;

WiFiServer server(3333);
WiFiClient laptop;   // the brain (nani_brain.py) connects here

// ---------- eyes ----------
void eyes(uint8_t r, uint8_t g, uint8_t b) {
  curR = r; curG = g; curB = b;
  uint8_t v[3] = {r, g, b};
  for (int i = 0; i < 3; i++) {
    ledcWrite(EYE_L[i], commonAnode ? 255 - v[i] : v[i]);
    ledcWrite(EYE_R[i], commonAnode ? 255 - v[i] : v[i]);
  }
}

void setMode(Mode m) {
  mode = m;
  if (m == LISTENING)     { eyes(0, 0, 120);   Serial.println("MODE: LISTENING (eyes blue)"); }
  else if (m == THINKING) { eyes(120, 0, 160); Serial.println("MODE: THINKING (eyes purple)"); }
  else                    { eyes(200, 0, 0);   Serial.println("MODE: SPEAKING (eyes red)"); }
}

// ---------- bass-cut filter (speaker protection) ----------
float hb0, hb1, hb2, ha1, ha2, hx1 = 0, hx2 = 0, hy1 = 0, hy2 = 0;
void hpfSetup() {
  float w0 = 2.0f * PI * HPF_HZ / RATE, al = sinf(w0) / (2.0f * 0.7071f), c = cosf(w0), a0 = 1.0f + al;
  hb0 = (1.0f + c) / 2.0f / a0; hb1 = -(1.0f + c) / a0; hb2 = hb0;
  ha1 = -2.0f * c / a0; ha2 = (1.0f - al) / a0;
}
void hpfReset() { hx1 = hx2 = hy1 = hy2 = 0; }
inline float hpf(float x) {
  float y = hb0 * x + hb1 * hx1 + hb2 * hx2 - ha1 * hy1 - ha2 * hy2;
  hx2 = hx1; hx1 = x; hy2 = hy1; hy1 = y;
  return y;
}

// ---------- mic ----------
bool micStart() {
  i2s_chan_config_t cc = I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_0, I2S_ROLE_MASTER);
  if (i2s_new_channel(&cc, nullptr, &micCh) != ESP_OK) return false;
  i2s_std_config_t sc = {
    .clk_cfg = I2S_STD_CLK_DEFAULT_CONFIG(RATE),
    .slot_cfg = I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_32BIT, I2S_SLOT_MODE_MONO),
    .gpio_cfg = {
      .mclk = I2S_GPIO_UNUSED, .bclk = (gpio_num_t)MIC_SCK, .ws = (gpio_num_t)MIC_WS,
      .dout = I2S_GPIO_UNUSED, .din = (gpio_num_t)MIC_SD,
      .invert_flags = {.mclk_inv = false, .bclk_inv = false, .ws_inv = false},
    },
  };
  sc.slot_cfg.slot_mask = I2S_STD_SLOT_LEFT;
  if (i2s_channel_init_std_mode(micCh, &sc) != ESP_OK) return false;
  return i2s_channel_enable(micCh) == ESP_OK;
}

// Reads one 20 ms frame as 16-bit samples. Returns false on a short read.
bool micFrame(int16_t *out) {
  size_t bytes = 0;
  if (i2s_channel_read(micCh, micRaw, sizeof(micRaw), &bytes, 200) != ESP_OK || bytes != sizeof(micRaw)) return false;
  for (int i = 0; i < FRAME; i++) out[i] = (int16_t)constrain(micRaw[i] >> MIC_SHIFT, (int32_t)-32768, (int32_t)32767);
  return true;
}

float frameRms(const int16_t *f, size_t n) {
  long s = 0;
  for (size_t i = 0; i < n; i++) s += f[i];
  float mean = (float)s / n, e = 0;
  for (size_t i = 0; i < n; i++) { float v = f[i] - mean; e += v * v; }
  return sqrtf(e / n);
}

// ---------- amp ----------
bool ampStart() {
  i2s_chan_config_t cc = I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_1, I2S_ROLE_MASTER);
  cc.auto_clear = true;
  if (i2s_new_channel(&cc, &ampCh, nullptr) != ESP_OK) return false;
  i2s_std_config_t sc = {
    .clk_cfg = I2S_STD_CLK_DEFAULT_CONFIG(RATE),
    .slot_cfg = I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_STEREO),
    .gpio_cfg = {
      .mclk = I2S_GPIO_UNUSED, .bclk = (gpio_num_t)AMP_BCLK, .ws = (gpio_num_t)AMP_LRC,
      .dout = (gpio_num_t)AMP_DIN, .din = I2S_GPIO_UNUSED,
      .invert_flags = {.mclk_inv = false, .bclk_inv = false, .ws_inv = false},
    },
  };
  if (i2s_channel_init_std_mode(ampCh, &sc) != ESP_OK) return false;
  return i2s_channel_enable(ampCh) == ESP_OK;
}

void ampOn(bool on) {
  digitalWrite(AMP_SD, on ? HIGH : LOW);
  if (on) { hpfReset(); delay(10); }
}

// Plays mono samples x gain, through the bass cut, on both channels.
void playMono(const int16_t *m, size_t n, float gain) {
  size_t i = 0;
  while (i < n) {
    size_t k = min((size_t)256, n - i);
    for (size_t j = 0; j < k; j++) {
      int16_t s = (int16_t)constrain((int32_t)hpf(m[i + j] * gain), (int32_t)-32768, (int32_t)32767);
      stereo[2 * j] = s; stereo[2 * j + 1] = s;
    }
    size_t w;
    i2s_channel_write(ampCh, stereo, k * 4, &w, portMAX_DELAY);
    i += k;
  }
}

void playSilence(int ms) {
  memset(stereo, 0, sizeof(stereo));
  for (size_t n = RATE * ms / 1000; n > 0;) {
    size_t k = min((size_t)256, n), w;
    i2s_channel_write(ampCh, stereo, k * 4, &w, portMAX_DELAY);
    n -= k;
  }
}

void flushMic() {
  static int16_t f[FRAME];
  for (int i = 0; i < 10; i++) micFrame(f);   // drop the speaker's echo
  ringCount = 0;
}

// ---------- speaking ----------
void sayGreeting() {
  setMode(SPEAKING);
  Serial.printf("Saying: \"%s\"\n", NANI_TEXT);
  ampOn(true);
  playMono(NANI_VOICE, NANI_VOICE_LEN, volume / 0.8f);   // greeting is pre-normalised + compressed
  playSilence(80);
  ampOn(false);
  flushMic();
  setMode(LISTENING);
}

// ---------- brain link (laptop) ----------
bool brainConnected() {
  if (!wifiOn) return false;
  if (laptop && laptop.connected()) return true;
  if (laptop) { laptop.stop(); Serial.println("Brain disconnected"); }
  WiFiClient c = server.accept();
  if (c) {
    laptop = c;
    laptop.setNoDelay(true);
    Serial.printf("Brain connected from %s\n", laptop.remoteIP().toString().c_str());
    return true;
  }
  return false;
}

bool readExact(uint8_t *dst, size_t n, uint32_t timeoutMs) {
  size_t got = 0;
  uint32_t t0 = millis();
  while (got < n) {
    if (!laptop.connected() && !laptop.available()) return false;
    int a = laptop.available();
    if (a > 0) { got += laptop.read(dst + got, min((size_t)a, n - got)); t0 = millis(); }
    else if (millis() - t0 > timeoutMs) return false;
    else delay(2);
  }
  return true;
}

bool writeMsg(const char *tag, const uint8_t *data, uint32_t len) {
  uint8_t head[8];
  memcpy(head, tag, 4);
  memcpy(head + 4, &len, 4);   // ESP32 is little-endian
  if (laptop.write(head, 8) != 8) return false;
  for (uint32_t off = 0; off < len;) {
    size_t w = laptop.write(data + off, min((uint32_t)4096, len - off));
    if (w == 0) return false;
    off += w;
  }
  return true;
}

void skipBytes(uint32_t n) {
  static uint8_t junk[256];
  while (n) { uint32_t k = min(n, (uint32_t)sizeof(junk)); if (!readExact(junk, k, 10000)) return; n -= k; }
}

// Sends the speech, says "Hmm" straight away, then plays each answer sentence as it arrives.
// Returns true if Nani said something.
bool askBrain() {
  uint32_t tEnd = millis();     // you stopped talking END_SILENCE_MS before this
  setMode(THINKING);
  Serial.printf("Sending %.1f s of speech to the brain...\n", recLen / (float)RATE);
  if (!writeMsg("UTT1", (uint8_t *)recBuf, recLen * 2)) { Serial.println("Send failed"); laptop.stop(); return false; }
  Serial.printf("[time] speech sent: %lu ms\n", millis() - tEnd);

  ampOn(true);                                                  // amp stays on until the answer ends
  playMono(FILLER_VOICE, FILLER_VOICE_LEN, volume / 0.8f);      // instant "Hmm, let me think!" from flash
  Serial.printf("[time] filler done: %lu ms\n", millis() - tEnd);

  int pieces = 0;
  while (true) {
    uint8_t head[8];
    if (!readExact(head, 8, BRAIN_TIMEOUT_MS)) break;
    uint32_t len; memcpy(&len, head + 4, 4);
    if (!memcmp(head, "HRD1", 4) || !memcmp(head, "ANS1", 4)) {
      static char text[512];
      uint32_t keep = min(len, (uint32_t)sizeof(text) - 1);
      if (!readExact((uint8_t *)text, keep, 10000)) break;
      text[keep] = 0;
      skipBytes(len - keep);
      Serial.printf("%s %s\n", !memcmp(head, "HRD1", 4) ? "You said :" : "Nani says:", text);
    } else if (!memcmp(head, "RPL1", 4)) {
      size_t keep = min((size_t)(len / 2), replyMax);
      if (!readExact((uint8_t *)replyBuf, keep * 2, 10000)) break;
      skipBytes(len - keep * 2);                                // too long: drop the end
      if (pieces == 0) {
        setMode(SPEAKING);
        Serial.printf("[time] Nani starts answering: %lu ms after the silence wait\n", millis() - tEnd);
      }
      playMono(replyBuf, keep, volume / 0.8f);                  // already bass-cut + boosted by the brain
      pieces++;
    } else if (!memcmp(head, "END1", 4)) {
      skipBytes(len);
      playSilence(80);
      ampOn(false);
      Serial.printf("[time] answer finished: %lu ms (%d piece%s)\n", millis() - tEnd, pieces, pieces == 1 ? "" : "s");
      flushMic();
      setMode(LISTENING);
      return pieces > 0;
    } else if (!memcmp(head, "SAY1", 4)) {
      skipBytes(len);                                           // website spoke just as you finished:
      playBlockUntilEnd(true);                                  // play it, then keep waiting for the answer
    } else {
      skipBytes(len);                                           // unknown message: ignore
    }
  }
  playSilence(40);
  ampOn(false);
  Serial.println("No (complete) answer from the brain: timeout or disconnected");
  laptop.stop();
  if (pieces) { flushMic(); setMode(LISTENING); return true; }
  return false;
}

// Called when the child has finished speaking.
void respond() {
  if (brainConnected() && replyBuf) {
    if (askBrain()) return;
  } else {
    Serial.println(wifiOn ? "No brain connected yet: run start-nani.bat on the laptop."
                          : "No Wi-Fi: check WIFI_SSID / WIFI_PASS.");
  }
  sayOffline();
}

// "Wait beta, I am waking up!" from flash, when the laptop brain isn't reachable.
void sayOffline() {
  setMode(SPEAKING);
  ampOn(true);
  playMono(OFFLINE_VOICE, OFFLINE_VOICE_LEN, volume / 0.8f);
  playSilence(80);
  ampOn(false);
  flushMic();
  setMode(LISTENING);
}

// ---------- listening ----------
void startRecording() {
  inSpeech = true; recLen = 0; speechMs = 0; silenceMs = 0;
  int start = (ringPos + PREROLL_FRAMES - ringCount) % PREROLL_FRAMES;
  for (int k = 0; k < ringCount && recLen + FRAME <= recMax; k++) {
    memcpy(recBuf + recLen, ring + ((start + k) % PREROLL_FRAMES) * FRAME, FRAME * 2);
    recLen += FRAME;
  }
  eyes(0, 0, 255);
  Serial.println("Heard a voice, recording...");
}

// Website speech (reminders, songs, Nani's lines on the stage page), pushed by the brain with
// SAY1, then RPL1 pieces, then END1. Played when awake; read and thrown away when asleep.
void websiteSpeech(bool play) {
  if (!wifiOn || !laptop || !laptop.connected() || laptop.available() < 8) return;
  uint8_t head[8];
  if (!readExact(head, 8, 2000)) return;
  uint32_t len; memcpy(&len, head + 4, 4);
  if (memcmp(head, "SAY1", 4)) { skipBytes(len); return; }   // not website speech: ignore
  skipBytes(len);
  if (play) { Serial.println("Website: Nani is saying something"); setMode(SPEAKING); ampOn(true); }
  playBlockUntilEnd(play);
  if (play) { playSilence(80); ampOn(false); flushMic(); setMode(LISTENING); }
  else Serial.println("(asleep: website speech ignored)");
}

// After a SAY1 header: play (or skip) RPL1 pieces until END1. Amp must already be on to play.
void playBlockUntilEnd(bool play) {
  uint8_t head[8];
  uint32_t len;
  while (true) {
    if (!readExact(head, 8, 10000)) return;
    memcpy(&len, head + 4, 4);
    if (!memcmp(head, "RPL1", 4) && play) {
      size_t keep = min((size_t)(len / 2), replyMax);
      if (!readExact((uint8_t *)replyBuf, keep * 2, 10000)) return;
      skipBytes(len - keep * 2);
      playMono(replyBuf, keep, volume / 0.8f);
    } else {
      skipBytes(len);
      if (!memcmp(head, "END1", 4)) return;
    }
  }
}

void listenTick() {
  static int16_t f[FRAME];
  static int dbg = 0;
  static uint32_t lastCheck = 0;
  if (millis() - lastCheck > 500) { lastCheck = millis(); brainConnected(); }   // let the brain connect
  if (!inSpeech) websiteSpeech(true);    // the website may want Nani to speak (not while the child talks)
  if (!micFrame(f)) return;
  float rms = frameRms(f, FRAME);

  if (debugOn && ++dbg >= 10) {
    dbg = 0;
    Serial.printf("level %6.0f  room %6.0f  start>%6.0f %s\n", rms, noiseFloor,
                  max(noiseFloor * START_FACTOR, MIN_START_RMS), inSpeech ? "RECORDING" : "");
  }

  if (!inSpeech) {
    memcpy(ring + ringPos * FRAME, f, FRAME * 2);
    ringPos = (ringPos + 1) % PREROLL_FRAMES;
    if (ringCount < PREROLL_FRAMES) ringCount++;
    if (rms > max(noiseFloor * START_FACTOR, MIN_START_RMS)) startRecording();
    else noiseFloor = 0.95f * noiseFloor + 0.05f * rms;
    return;
  }

  if (recLen + FRAME <= recMax) { memcpy(recBuf + recLen, f, FRAME * 2); recLen += FRAME; }
  speechMs += FRAME_MS;
  if (rms > max(noiseFloor * STOP_FACTOR, MIN_START_RMS * 0.6f)) silenceMs = 0;
  else silenceMs += FRAME_MS;

  bool full = recLen + FRAME > recMax;
  if (silenceMs >= END_SILENCE_MS || full) {
    inSpeech = false;
    ringCount = 0;
    if (speechMs - silenceMs < MIN_SPEECH_MS) { Serial.println("Too short, ignored"); eyes(0, 0, 120); return; }
    size_t trim = silenceMs > 200 ? (size_t)(silenceMs - 200) * RATE / 1000 : 0;
    recLen -= min(recLen, trim);
    respond();
  }
}

// ---------- Wi-Fi ----------
void wifiStart() {
  if (strcmp(WIFI_SSID, "YOUR_WIFI_NAME") == 0) { Serial.println("Wi-Fi: skipped (no SSID set)"); return; }
  Serial.printf("Wi-Fi: connecting to \"%s\"", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  for (int i = 0; i < 30 && WiFi.status() != WL_CONNECTED; i++) { Serial.print("."); delay(500); }
  if (WiFi.status() != WL_CONNECTED) { Serial.println("\nWi-Fi: failed (2.4 GHz? password?). Running without it."); return; }
  wifiOn = true;
  MDNS.begin("nani");
  server.begin();
  server.setNoDelay(true);
  Serial.printf("\nWi-Fi: connected. On the laptop run:\n   python nani_brain.py --host %s\n", WiFi.localIP().toString().c_str());
}

// ---------- on/off: latching push switch, edge-triggered ----------
// The switch locks down on one press and pops up on the next, so its two positions differ.
// We react to the CHANGE, not the position: every press toggles Nani awake <-> asleep.
bool awake = false;

void wakeUp() {
  awake = true;
  Serial.println("\n*** Nani is AWAKE ***");
  inSpeech = false; ringCount = 0;
  sayGreeting();                      // red while speaking, then blue: listening
}

void goToSleep() {
  awake = false;
  inSpeech = false; ringCount = 0;
  ampOn(false);
  eyes(0, 0, 0);
  Serial.println("\n*** Nani is ASLEEP (press the switch to wake her) ***");
}

void toggleNani() { if (awake) goToSleep(); else wakeUp(); }

// Debounced edge detector: true once per press (either direction).
bool switchPressed() {
  static int stable = -1, last = -1;
  static uint32_t changedAt = 0;
  int now = digitalRead(SWITCH_PIN);
  if (stable < 0) { stable = last = now; return false; }     // first read: remember position only
  if (now != last) { last = now; changedAt = millis(); }      // still bouncing
  if (now != stable && millis() - changedAt > 40) { stable = now; return true; }
  return false;
}

// ---------- commands ----------
void help() {
  Serial.printf("Commands: + / - volume (now %.2f)   g greeting   w wake/sleep (same as the switch)   d mic level   a flip LED type   h help\n", volume);
}

void handle(char c) {
  switch (c) {
    case '+': volume = min(volume + 0.05f, 0.8f); Serial.printf("Volume %.2f\n", volume); break;
    case '-': volume = max(volume - 0.05f, 0.05f); Serial.printf("Volume %.2f\n", volume); break;
    case 'g': if (awake) sayGreeting(); break;
    case 'w': toggleNani(); break;
    case 'd': debugOn = !debugOn; Serial.printf("Mic level %s\n", debugOn ? "on" : "off"); break;
    case 'a': commonAnode = !commonAnode; eyes(curR, curG, curB);
              Serial.printf("LEDs: common %s\n", commonAnode ? "anode" : "cathode"); break;
    case 'h': help(); break;
    default: break;
  }
}

// ---------- setup / loop ----------
void setup() {
  Serial.begin(115200);
  uint32_t t0 = millis();
  while (!Serial && millis() - t0 < 3000) delay(10);
  delay(200);

  pinMode(AMP_SD, OUTPUT);
  digitalWrite(AMP_SD, LOW);
  for (int i = 0; i < 3; i++) { ledcAttach(EYE_L[i], 5000, 8); ledcAttach(EYE_R[i], 5000, 8); }
  hpfSetup();

  Serial.println("\n======== NANI FULL TEST ========");
  bool micOk = micStart(), ampOk = ampStart();
  Serial.printf("Mic: %s   Amp: %s\n", micOk ? "OK" : "FAILED", ampOk ? "OK" : "FAILED");

  size_t want = (size_t)(RATE * MAX_SECONDS);
  if (psramFound()) recBuf = (int16_t *)ps_malloc(want * 2);
  if (!recBuf) { want = RATE * 3; recBuf = (int16_t *)malloc(want * 2); }
  recMax = recBuf ? want : 0;
  size_t rwant = (size_t)(RATE * MAX_REPLY_SECONDS);
  if (psramFound()) replyBuf = (int16_t *)ps_malloc(rwant * 2);
  if (!replyBuf) { rwant = RATE * 3; replyBuf = (int16_t *)malloc(rwant * 2); }
  replyMax = replyBuf ? rwant : 0;
  Serial.printf("PSRAM: %s, max recording %.0f s, max answer %.0f s\n",
                psramFound() ? "yes" : "no (set Tools > PSRAM > OPI PSRAM)", recMax / (float)RATE, replyMax / (float)RATE);

  wifiStart();

  // Learn the room's noise for half a second.
  static int16_t f[FRAME];
  float acc = 0; int n = 0;
  for (int i = 0; i < 25; i++) if (micFrame(f)) { acc += frameRms(f, FRAME); n++; }
  if (n) noiseFloor = acc / n;
  Serial.printf("Room noise level: %.0f\n", noiseFloor);
  help();

  pinMode(SWITCH_PIN, INPUT_PULLUP);
  switchPressed();   // remember where the switch is right now, so power-up isn't counted as a press
  goToSleep();       // start asleep; one press of the switch wakes Nani
}

void loop() {
  while (Serial.available()) handle((char)Serial.read());
  if (switchPressed()) toggleNani();
  if (awake && mode == LISTENING && recBuf) listenTick();
  else if (!awake) { brainConnected(); websiteSpeech(false); delay(10); }   // asleep: keep the link, stay quiet
}
