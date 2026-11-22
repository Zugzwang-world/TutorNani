#!/usr/bin/env node
// S1 · Pre-made audio for Tutor Grandma (docs/plan/NANI.md C5 to C7, ids in docs/plan/CONTRACTS.md).
//
//   node scripts/audio/generate.mjs [--force <id>]... [--check]
//
// Makes Nani's lines (TTS), animal sounds and effects (sound effects), the song and its chorus snippet
// (music), the waiting music loop (sound effects with loop: true), trims silence, normalises loudness,
// checks every new Nani line with speech-to-text and rewrites content/audio.json. Files that already
// exist are skipped.
//   --force <id>  redo one id (repeatable). Forcing `song` also recuts `song_snippet`.
//   --check       re-run the speech-to-text check on every Nani line, not only the new ones.
// Needs Node 24, ffmpeg and ffprobe. Reads ELEVENLABS_API_KEY from the environment or apps/web/.env.local.
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const OUT_DIR = join(ROOT, "apps/web/public/audio");
const MANIFEST = join(ROOT, "content/audio.json");
const CONFIG = readJson(join(ROOT, "content/demo.config.json"));
const SPEC = readJson(join(HERE, "sounds.json"));
const API = "https://api.elevenlabs.io";
const TMP = mkdtempSync(join(tmpdir(), "tg-audio-"));

const TARGET_I = -16; // LUFS, every file
const TARGET_TP = -1.5; // dBTP ceiling
const FAIL_SCORE = 0.4; // word overlap below this is an obvious failure
const REACTION_MAX_S = 1.0; // Layer 1 reactions must be under 1 s
const MIN_REMAINING = 0.5; // stop if under 50% of the credit limit would remain
const EST = { sfx: 500, music: 6000 }; // credit estimates before the first real cost is seen; TTS = characters
const POOL = 3;

const TRIM_HEAD = "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.02:detection=peak";
const TRIM_TAIL = "areverse,silenceremove=start_periods=1:start_threshold=-55dB:start_silence=0.1:detection=peak,areverse";

// ---------- args ----------
const force = new Set();
let checkAll = false;
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--force" && argv[i + 1]) force.add(argv[++i]);
  else if (argv[i] === "--check") checkAll = true;
  else die(`unknown argument: ${argv[i]}  (use --force <id> or --check)`);
}

const VOICE = SPEC.voice.map((v) => ({ ...v, text: v.text.replaceAll("{childName}", CONFIG.childName) }));
const SFX = SPEC.sfx;
const SONG = SPEC.song;
const LOOPS = SPEC.music ?? [];
const ALL_IDS = [...VOICE.map((v) => v.id), ...SFX.map((s) => s.id), ...LOOPS.map((s) => s.id), "song", "song_snippet"];
for (const id of force) if (!ALL_IDS.includes(id)) die(`--force: unknown id ${id}`);
if (force.has("song")) force.add("song_snippet");

const KEY = apiKey();
mkdirSync(OUT_DIR, { recursive: true });

// ---------- small helpers ----------
function readJson(f) {
  return JSON.parse(readFileSync(f, "utf8"));
}
function die(msg) {
  console.error(msg);
  process.exit(1);
}
function apiKey() {
  let k = process.env.ELEVENLABS_API_KEY;
  const envFile = join(ROOT, "apps/web/.env.local");
  if (!k && existsSync(envFile)) k = readFileSync(envFile, "utf8").match(/^\s*ELEVENLABS_API_KEY\s*=\s*(.*)$/m)?.[1];
  if (!k) die("ELEVENLABS_API_KEY not found in the environment or apps/web/.env.local");
  return k.trim().replace(/^["']|["']$/g, "");
}
const out = (id) => join(OUT_DIR, `${id}.mp3`);
const tmp = (name) => join(TMP, name);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const r2 = (n) => Math.round(n * 100) / 100;
const needs = (id) => force.has(id) || !existsSync(out(id));

async function pool(items, n, fn) {
  const q = [...items];
  await Promise.all(Array.from({ length: Math.min(n, q.length) }, async () => { while (q.length) await fn(q.shift()); }));
}

// ---------- ElevenLabs ----------
let spent = 0; // credits reported by character-cost headers this run
async function call(path, init, label, timeoutMs = 90_000) {
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(API + path, { ...init, headers: { "xi-api-key": KEY, ...init.headers }, signal: AbortSignal.timeout(timeoutMs) });
    } catch (e) {
      if (attempt < 2) { await sleep(2000 * 2 ** attempt); continue; }
      throw new Error(`${label}: ${e.message}`);
    }
    if (res.ok) {
      const cost = Number(res.headers.get("character-cost"));
      if (Number.isFinite(cost)) spent += cost;
      return res;
    }
    const body = (await res.text()).slice(0, 300);
    if ((res.status === 429 || res.status >= 500) && attempt < 3) { await sleep(2000 * 2 ** attempt); continue; }
    throw new Error(`${label}: HTTP ${res.status} ${body}`);
  }
}
const postJson = (path, body, label, timeoutMs) =>
  call(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, label, timeoutMs);
const bytes = async (res) => Buffer.from(await res.arrayBuffer());

async function tts(text) {
  const n = CONFIG.nani;
  return bytes(await postJson(`/v1/text-to-speech/${n.voiceId}?output_format=mp3_44100_128`,
    { text, model_id: n.premadeModel, language_code: n.languageCode }, "tts"));
}
async function soundEffect(s) {
  return bytes(await postJson(`/v1/sound-generation?output_format=mp3_44100_128`,
    { text: s.prompt, duration_seconds: s.seconds, prompt_influence: 0.5, model_id: SPEC.models.sfx }, s.id));
}
async function music(style) {
  const lyrics = `[Verse]\n${SONG.verse.join("\n")}\n\n[Chorus]\n${SONG.chorus.join("\n")}`;
  const body = style === "prompt"
    ? { model_id: SPEC.models.music, prompt: `${SONG.style}\n\nLyrics:\n${lyrics}`, music_length_ms: SONG.lengthMs }
    : {
        model_id: SPEC.models.music,
        composition_plan: {
          chunks: [
            { text: `[Verse]\n${SONG.verse.join("\n")}`, duration_ms: SONG.verseMs, positive_styles: SONG.styles, negative_styles: SONG.negativeStyles },
            { text: `[Chorus]\n${SONG.chorus.join("\n")}`, duration_ms: SONG.chorusMs, positive_styles: ["joyful sing-along chorus", "hand claps", "warm female vocal"], negative_styles: SONG.negativeStyles },
          ],
        },
      };
  return bytes(await postJson(`/v1/music?output_format=mp3_44100_128`, body, `song (${style})`, 300_000));
}
async function stt(file, words = false) {
  const fd = new FormData();
  fd.append("model_id", SPEC.models.stt);
  fd.append("file", new Blob([readFileSync(file)], { type: "audio/mpeg" }), "clip.mp3");
  fd.append("language_code", CONFIG.nani.languageCode);
  fd.append("tag_audio_events", "false");
  if (words) fd.append("timestamps_granularity", "word");
  return (await call("/v1/speech-to-text", { method: "POST", body: fd }, "stt")).json();
}

// ---------- credit guard ----------
const readings = [];
let base = null; // last subscription reading
let spentAtBase = 0;
async function reading(label) {
  const j = await (await call("/v1/user/subscription", {}, "subscription")).json();
  base = { label, at: new Date().toISOString(), used: j.character_count, limit: j.character_limit };
  spentAtBase = spent;
  readings.push(base);
  console.log(`credits (${label}, ${base.at}): used ${base.used} of ${base.limit}, ${base.limit - base.used} left`);
}
class GuardStop extends Error {}
function guard(cost, label) {
  const left = base.limit - base.used - (spent - spentAtBase) - cost;
  if (left < base.limit * MIN_REMAINING)
    throw new GuardStop(`credit guard: ${label} would leave ${Math.round(left)} of ${base.limit} (< 50%). Stopping.`);
}

// ---------- ffmpeg ----------
function ff(args) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-y", ...args], { encoding: "utf8", maxBuffer: 64 << 20 });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr.slice(-400)}`);
  return r.stderr;
}
function loudness(file, pre = "") {
  // apad keeps very short clips above the 400 ms EBU R128 block; silence does not change gated loudness.
  const af = [pre, "apad=pad_dur=1", `loudnorm=I=${TARGET_I}:TP=${TARGET_TP}:LRA=11:print_format=json`].filter(Boolean).join(",");
  const err = ff(["-i", file, "-af", af, "-f", "null", "-"]);
  const j = JSON.parse(err.slice(err.lastIndexOf("{"), err.lastIndexOf("}") + 1));
  return { i: Number(j.input_i), tp: Number(j.input_tp) };
}
function duration(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" });
  return Number(r.stdout.trim()) || 0;
}
/**
 * Trim silence, one linear gain to -16 LUFS, and a fast limiter only where that gain would push peaks
 * past the ceiling (peaky speech and clicks), then 44.1 kHz mp3 128k. `tempo` > 1 speeds a clip up.
 */
function finish(raw, dest, { tail = true, tailKeep = 0.1, tempo = 1 } = {}) {
  const pre = [
    TRIM_HEAD,
    tail ? TRIM_TAIL.replace("start_silence=0.1", `start_silence=${tailKeep}`) : "",
    tempo > 1 ? `atempo=${tempo.toFixed(3)}` : "",
  ].filter(Boolean).join(",");
  const m = loudness(raw, pre);
  if (!Number.isFinite(m.i) || !Number.isFinite(m.tp)) throw new Error(`silent audio: ${raw}`);
  const gain = Math.min(TARGET_I - m.i, 30);
  const limit = m.tp + gain > TARGET_TP - 1 ? `,alimiter=limit=${(10 ** ((TARGET_TP - 1) / 20)).toFixed(3)}:attack=2:release=60:level=false:latency=true` : "";
  ff(["-i", raw, "-af", `${pre},volume=${gain.toFixed(2)}dB${limit}`, "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "128k", "-map_metadata", "-1", dest]);
  return dest;
}

// ---------- word overlap (Scribe writes Hindi in Devanagari, our lines are Roman) ----------
const DV = { "अ": "a", "आ": "aa", "इ": "i", "ई": "ee", "उ": "u", "ऊ": "oo", "ऋ": "ri", "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au", "ऑ": "o", "ऍ": "e" };
const DM = { "ा": "aa", "ि": "i", "ी": "ee", "ु": "u", "ू": "oo", "ृ": "ri", "े": "e", "ै": "ai", "ो": "o", "ौ": "au", "ॉ": "o", "ॅ": "e" };
const DC = { "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "n", "च": "ch", "छ": "chh", "ज": "j", "झ": "jh", "ञ": "n", "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n", "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n", "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m", "य": "y", "र": "r", "ल": "l", "व": "v", "श": "sh", "ष": "sh", "स": "s", "ह": "h" };
const NUKTA = { "क": "q", "ख": "kh", "ग": "g", "ज": "z", "ड": "r", "ढ": "rh", "फ": "f" };
const DIGITS = { "0": ["zero", "shunya"], "1": ["one", "ek"], "2": ["two", "do"], "3": ["three", "teen"], "4": ["four", "chaar"], "5": ["five", "paanch"], "6": ["six", "chhah"], "7": ["seven", "saat"], "8": ["eight", "aath"], "9": ["nine", "nau"], "10": ["ten", "das"] };

function translit(s) {
  const ch = [...s.normalize("NFC")];
  let o = "";
  let schwa = false; // consonant waiting for its inherent "a"
  for (let i = 0; i < ch.length; i++) {
    const c = ch[i];
    if (DC[c] !== undefined) {
      if (schwa) o += "a";
      let v = DC[c];
      if (ch[i + 1] === "़") { v = NUKTA[c] ?? v; i++; }
      o += v;
      schwa = true;
    } else if (DM[c] !== undefined) { o += DM[c]; schwa = false; }
    else if (c === "्") schwa = false; // halant
    else if (c === "ं" || c === "ँ") { if (schwa) o += "a"; o += "n"; schwa = false; }
    else if (c === "ः") { if (schwa) o += "a"; o += "h"; schwa = false; }
    else if (DV[c] !== undefined) { if (schwa) o += "a"; o += DV[c]; schwa = false; }
    else if (c >= "०" && c <= "९") { o += String(c.charCodeAt(0) - 0x966); schwa = false; }
    else { o += c; schwa = false; } // word end drops the final schwa
  }
  return o;
}
const tokens = (s) => translit(s).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
function fold(w) {
  return w.replace(/ph/g, "f").replace(/w/g, "v").replace(/z/g, "j").replace(/q/g, "k").replace(/ck/g, "k")
    .replace(/ee/g, "i").replace(/oo/g, "u").replace(/([bcdfgjklmnprstvy])h/g, "$1").replace(/(.)\1+/g, "$1");
}
function lev(a, b) {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const t = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = t;
    }
  }
  return d[b.length];
}
const sim = (a, b) => (a === b ? 1 : 1 - lev(a, b) / Math.max(a.length, b.length));
const heardForms = (s) => tokens(s).map((t) => (DIGITS[t] ?? [t]).map(fold));
/** Share of the expected words that were heard (fuzzy, either script). */
function overlap(expected, heard) {
  const want = tokens(expected).map(fold);
  const got = heardForms(heard);
  const used = new Set();
  let hit = 0;
  for (const w of want) {
    let best = -1;
    let bs = 0;
    got.forEach((forms, i) => {
      if (used.has(i)) return;
      const s = Math.max(...forms.map((f) => sim(w, f)));
      if (s > bs) { bs = s; best = i; }
    });
    if (best >= 0 && bs >= 0.6) { used.add(best); hit++; }
  }
  return want.length ? hit / want.length : 0;
}

// ---------- Nani's lines ----------
const report = []; // STT table rows
function verdict(line, c) {
  if (line.kind === "reaction") {
    if (c.dur > REACTION_MAX_S) return `longer than ${REACTION_MAX_S} s`;
    if (c.dur < 0.15) return "too short";
    return ""; // one-word interjections are not judged on overlap
  }
  if (c.score < FAIL_SCORE) return "low overlap";
  if (c.dur < 0.3) return "too short";
  if (c.dur > Math.max(3, (line.text.length / 14) * 3)) return "too long";
  return "";
}
function better(line, a, b) {
  if (!a.fail !== !b.fail) return a.fail ? b : a;
  if (line.kind === "reaction") return a.dur <= b.dur ? a : b;
  return a.score >= b.score ? a : b;
}
const REACTION_OPTS = (line) => (line.kind === "reaction" ? { tailKeep: 0.05 } : {});
async function judge(line, file, attempt) {
  const dur = duration(file);
  const heard = ((await stt(file)).text ?? "").trim();
  const c = { file, dur, heard, score: overlap(line.text, heard), attempt };
  c.fail = verdict(line, c);
  return c;
}
async function makeVoice(line) {
  let best = null;
  const fresh = needs(line.id);
  if (!fresh) best = await judge(line, out(line.id), 0); // --check on an existing file
  for (let attempt = 1; attempt <= 2 && (!best || best.fail); attempt++) {
    guard(line.text.length, line.id);
    const raw = tmp(`${line.id}.raw${attempt}.mp3`);
    writeFileSync(raw, await tts(line.text));
    let file = finish(raw, tmp(`${line.id}.${attempt}.mp3`), REACTION_OPTS(line));
    if (line.kind === "reaction" && duration(file) > REACTION_MAX_S - 0.02) {
      // a reaction must end within a second: speed it up a little (at most 1.25x) rather than wait
      const tempo = Math.min(duration(file) / (REACTION_MAX_S - 0.05), 1.25);
      file = finish(raw, tmp(`${line.id}.${attempt}.fast.mp3`), { ...REACTION_OPTS(line), tempo });
    }
    const c = await judge(line, file, attempt);
    best = best ? better(line, best, c) : c;
  }
  if (best.file !== out(line.id)) copyFileSync(best.file, out(line.id));
  const m = loudness(out(line.id));
  report.push({ id: line.id, dur: r2(best.dur), i: r2(m.i), tp: r2(m.tp), score: r2(best.score), tries: best.attempt, fail: best.fail, heard: best.heard });
  console.log(`  ${line.id}: ${r2(best.dur)} s, overlap ${r2(best.score)}${best.fail ? ` (${best.fail})` : ""}`);
}

// ---------- sound effects ----------
const levels = [];
async function makeSfx(s) {
  guard(EST.sfx, s.id);
  const raw = tmp(`${s.id}.raw.mp3`);
  writeFileSync(raw, await soundEffect(s));
  finish(raw, out(s.id));
  const m = loudness(out(s.id));
  levels.push({ id: s.id, dur: r2(duration(out(s.id))), i: r2(m.i), tp: r2(m.tp) });
  console.log(`  ${s.id}: ${r2(duration(out(s.id)))} s`);
}

// ---------- music loops (R3: wait_music) ----------
// One seamless cycle from sound effects v3 with loop: true. No silence trims, fades or limiter (each would
// break the join): one linear gain to the entry's `lufs`, encoded once. PCM is asked for first, so no mp3
// encoder padding sits in the source. The join (last sample -> first sample) is then checked on the
// decoded file, and speech-to-text must hear no words.
async function loopRaw(s) {
  const body = { text: s.prompt, duration_seconds: s.seconds, prompt_influence: s.promptInfluence ?? 0.5, loop: true, model_id: SPEC.models.sfx };
  try {
    const pcm = await bytes(await postJson(`/v1/sound-generation?output_format=pcm_44100`, body, `${s.id} (pcm)`));
    const ch = Math.max(1, Math.round(pcm.length / (2 * 44100 * s.seconds))); // s16le: the length gives the channels
    const raw = tmp(`${s.id}.raw.pcm`);
    writeFileSync(raw, pcm);
    const wav = tmp(`${s.id}.raw.wav`);
    ff(["-f", "s16le", "-ar", "44100", "-ac", String(ch), "-i", raw, wav]);
    return { file: wav, how: `pcm_44100, ${ch} ch` };
  } catch (e) {
    console.log(`  ${s.id}: PCM not available (${e.message.slice(0, 120)}), using mp3`);
    const raw = tmp(`${s.id}.raw.mp3`);
    writeFileSync(raw, await bytes(await postJson(`/v1/sound-generation?output_format=mp3_44100_192`, body, `${s.id} (mp3)`)));
    return { file: raw, how: "mp3_44100_192" };
  }
}
function samples(file) {
  const ch = Number(spawnSync("ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=channels", "-of", "csv=p=0", file], { encoding: "utf8" }).stdout.trim()) || 1;
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-f", "f32le", "-acodec", "pcm_f32le", "-"], { maxBuffer: 256 << 20 });
  if (r.status !== 0) throw new Error(`decode failed: ${file}`);
  const b = Buffer.from(r.stdout);
  return { x: new Float32Array(b.buffer, b.byteOffset, b.length >> 2), ch };
}
/** The loop's join: the jump from its last sample to its first against the 99th percentile step inside it. */
function joinCheck(file) {
  const { x, ch } = samples(file);
  const n = x.length / ch;
  const step = (i, j) => { let m = 0; for (let c = 0; c < ch; c++) m = Math.max(m, Math.abs(x[i * ch + c] - x[j * ch + c])); return m; };
  const steps = new Float32Array(n - 1);
  for (let i = 1; i < n; i++) steps[i - 1] = step(i, i - 1);
  steps.sort();
  const p99 = steps[Math.floor(steps.length * 0.99)];
  const jump = step(0, n - 1);
  const w = Math.round(0.02 * 44100);
  const rms = (a, b) => { let e = 0; for (let i = a * ch; i < b * ch; i++) e += x[i] * x[i]; return Math.sqrt(e / ((b - a) * ch)) || 1e-9; };
  const levelStepDb = 20 * Math.log10(rms(0, w) / rms(n - w, n));
  return { seconds: r2(n / 44100), jump: Number(jump.toFixed(4)), p99: Number(p99.toFixed(4)), ratio: r2(jump / p99), levelStepDb: r2(levelStepDb), clean: jump <= p99 };
}
const loopInfo = {};
async function makeLoop(s) {
  guard(EST.sfx, s.id);
  const { file: raw, how } = await loopRaw(s);
  const rawJoin = joinCheck(raw);
  const m = loudness(raw);
  if (!Number.isFinite(m.i)) throw new Error(`silent audio: ${raw}`);
  ff(["-i", raw, "-af", `volume=${(s.lufs - m.i).toFixed(2)}dB`, "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "128k", "-map_metadata", "-1", out(s.id)]);
  const fileJoin = joinCheck(out(s.id));
  const heard = ((await stt(out(s.id))).text ?? "").trim();
  const lv = loudness(out(s.id));
  levels.push({ id: s.id, dur: r2(duration(out(s.id))), i: r2(lv.i), tp: r2(lv.tp) });
  Object.assign(loopInfo, { [s.id]: { source: how, rawJoin, fileJoin, heard } });
  console.log(`  ${s.id}: ${fileJoin.seconds} s (${how}), join ${fileJoin.clean ? "clean" : "CHECK"}: jump ${fileJoin.jump} vs p99 step ${fileJoin.p99}; heard "${heard}"`);
}

// ---------- song and snippet ----------
const songInfo = {};
const lyricsText = () => [...SONG.verse, ...SONG.chorus].join(" ");
async function makeSong() {
  let best = null;
  for (const style of ["prompt", "plan"]) {
    if (best) await reading("before the song retry"); // music cost is not in the character-cost header
    guard(EST.music, `song (${style})`);
    const raw = tmp(`song.${style}.raw.mp3`);
    writeFileSync(raw, await music(style));
    const file = finish(raw, tmp(`song.${style}.mp3`), { tail: false });
    const heard = ((await stt(file)).text ?? "").trim();
    const c = { style, file, heard, score: overlap(lyricsText(), heard), dur: duration(file) };
    console.log(`  song (${style}): ${r2(c.dur)} s, lyric overlap ${r2(c.score)}`);
    if (!best || c.score > best.score) best = c;
    if (best.score >= 0.5) break;
  }
  copyFileSync(best.file, out("song"));
  Object.assign(songInfo, { style: best.style, lyricOverlap: r2(best.score), heard: best.heard });
}

const COUNT_HI = ["ek", "do", "teen", "chaar", "paanch"].map(fold);
const COUNT_EN = ["one", "two", "three", "four", "five"].map(fold);
function findRun(words, seq) {
  // first index where seq[0] is heard and at least two more of the sequence follow within six words
  for (let i = 0; i < words.length; i++) {
    if (!words[i].forms.some((f) => sim(f, seq[0]) >= 0.6)) continue;
    const next = words.slice(i + 1, i + 7);
    const hits = seq.slice(1).filter((s) => next.some((w) => w.forms.some((f) => sim(f, s) >= 0.6))).length;
    if (hits >= 2) return i;
  }
  return -1;
}
async function makeSnippet() {
  const song = out("song");
  const total = duration(song);
  const j = await stt(song, true);
  const words = (j.words ?? []).filter((w) => w.type === "word")
    .map((w) => ({ start: w.start, end: w.end, forms: heardForms(w.text).flat() }))
    .filter((w) => w.forms.length);
  let start;
  let how;
  const hi = findRun(words, COUNT_HI);
  const en = findRun(words, COUNT_EN);
  if (hi >= 0) { start = words[hi].start - 0.15; how = "STT: 'ek do teen' found"; }
  else if (en >= 0) { start = words[en].start - 0.15; how = "STT: 'one two three' found"; }
  else { start = total * 0.55; how = "fallback: 55% into the song"; }
  start = Math.max(0, Math.min(start, total - 6));
  // end on a word boundary between 6 and 8 s after the start
  const ends = words.map((w) => w.end + 0.3 - start).filter((d) => d >= 6 && d <= 8);
  let len = ends.length ? Math.max(...ends) : 7;
  len = Math.min(len, total - start);
  const cut = tmp("song_snippet.raw.wav");
  ff(["-ss", start.toFixed(2), "-t", len.toFixed(2), "-i", song, "-af", `afade=t=in:d=0.05,afade=t=out:st=${(len - 0.4).toFixed(2)}:d=0.4`, cut]);
  // the song is already trimmed; keep the cut as it is apart from the level
  const m = loudness(cut);
  const gain = Math.min(TARGET_I - m.i, TARGET_TP - m.tp);
  ff(["-i", cut, "-af", `volume=${gain.toFixed(2)}dB`, "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "128k", "-map_metadata", "-1", out("song_snippet")]);
  Object.assign(songInfo, { snippetStart: r2(start), snippetLen: r2(duration(out("song_snippet"))), snippetHow: how });
  console.log(`  song_snippet: ${r2(start)} s + ${r2(len)} s (${how})`);
}

// ---------- manifest ----------
function writeManifest() {
  const defs = [
    ...VOICE.map((v) => ({ id: v.id, kind: v.kind, area: v.area, text: v.text })),
    ...SFX.map((s) => ({ id: s.id, kind: "sfx", area: s.area })),
    ...LOOPS.map((s) => ({ id: s.id, kind: "music" })),
    { id: "song", kind: "song", text: SONG.title },
    { id: "song_snippet", kind: "snippet", text: SONG.snippetText },
  ];
  const entries = [];
  const missing = [];
  for (const d of defs) {
    if (!existsSync(out(d.id))) { missing.push(d.id); continue; }
    entries.push({ id: d.id, file: `/audio/${d.id}.mp3`, kind: d.kind, ...(d.area ? { area: d.area } : {}), ...(d.text ? { text: d.text } : {}), duration: r2(duration(out(d.id))) });
  }
  entries.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  writeFileSync(MANIFEST, JSON.stringify(entries, null, 2) + "\n");
  console.log(`manifest: ${entries.length} entries in content/audio.json${missing.length ? `, missing: ${missing.join(", ")}` : ""}`);
  return missing;
}

// ---------- report ----------
function printReport() {
  if (report.length) {
    report.sort((a, b) => (a.id < b.id ? -1 : 1));
    console.log("\n### Speech-to-text check (Nani's lines)\n");
    console.log("| id | s | LUFS | dBTP | overlap | tries | note | heard |\n|---|---|---|---|---|---|---|---|");
    for (const r of report) console.log(`| ${r.id} | ${r.dur} | ${r.i} | ${r.tp} | ${r.score} | ${r.tries} | ${r.fail} | ${r.heard.replaceAll("|", "/")} |`);
    const judged = report.filter((r) => !VOICE.find((v) => v.id === r.id && v.kind === "reaction"));
    if (judged.length) console.log(`\nmean overlap (non-reactions): ${r2(judged.reduce((s, r) => s + r.score, 0) / judged.length)}`);
  }
  for (const id of ["song", "song_snippet"]) {
    if (!existsSync(out(id)) || levels.some((l) => l.id === id)) continue;
    const m = loudness(out(id));
    levels.push({ id, dur: r2(duration(out(id))), i: r2(m.i), tp: r2(m.tp) });
  }
  if (levels.length) {
    levels.sort((a, b) => (a.id < b.id ? -1 : 1));
    console.log("\n### Sounds\n");
    console.log("| id | s | LUFS | dBTP |\n|---|---|---|---|");
    for (const r of levels) console.log(`| ${r.id} | ${r.dur} | ${r.i} | ${r.tp} |`);
  }
  if (Object.keys(songInfo).length) console.log(`\n### Song\n\n${JSON.stringify(songInfo, null, 2)}`);
  if (Object.keys(loopInfo).length) console.log(`\n### Music loops\n\n${JSON.stringify(loopInfo, null, 2)}`);
  console.log("\n### Credits\n");
  for (const r of readings) console.log(`- ${r.label} (${r.at}): used ${r.used} of ${r.limit}, ${r.limit - r.used} left`);
  console.log(`- reported by character-cost headers this run: ${spent}`);
}

// ---------- run ----------
let stopped = "";
try {
  await reading("start");
  const lines = VOICE.filter((v) => needs(v.id) || checkAll);
  guard(lines.filter((v) => needs(v.id)).reduce((s, v) => s + v.text.length, 0), "Nani's lines");
  if (lines.length) console.log(`Nani's lines (${lines.length}):`);
  await pool(lines, POOL, makeVoice);
  const sfx = SFX.filter((s) => needs(s.id));
  if (sfx.length) console.log(`sounds (${sfx.length}):`);
  await pool(sfx, POOL, makeSfx);
  const loops = LOOPS.filter((s) => needs(s.id));
  if (loops.length) console.log(`music loops (${loops.length}):`);
  for (const s of loops) await makeLoop(s);
  if (needs("song")) {
    await reading("before the song");
    console.log("song:");
    await makeSong();
  }
  if (needs("song_snippet") && existsSync(out("song"))) await makeSnippet();
} catch (e) {
  if (!(e instanceof GuardStop)) { writeManifest(); rmSync(TMP, { recursive: true, force: true }); throw e; }
  stopped = e.message;
  console.error(stopped);
}
await reading("end");
const missing = writeManifest();
printReport();
rmSync(TMP, { recursive: true, force: true });
if (stopped || missing.length) process.exit(2);
