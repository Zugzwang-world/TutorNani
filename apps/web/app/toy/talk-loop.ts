// The talking loop on /toy and /stage (PLAN.md C2, REFINE R3), as a plain class: press to record, release to
// send, cover the wait, then play Nani's sentences in order and drive the wall with their cues.
// Waiting (R3): a calm reaction at the send tap; the wordless wait_music only when Nani is really late; her
// first sentence plays the moment it is ready, with the music fading out under it. No spoken fillers.
// No React here; use-talk.ts wraps it.
import { audioById } from "@/lib/audio";
import type { BoardState, Cue, FallbackId, NaniEvent, TurnEvent } from "@/lib/types";
import type { Clip, NaniPlayer } from "@/lib/voice/player";
import { WAIT_MUSIC_ID, WaitPicker, type Today } from "./fillers";
import type { EyeState, WallPayload } from "./use-toy-core";

const MIN_PRESS_MS = 250; // shorter presses are accidental taps (they still stop Nani)
const AFTER_SEND_MS = 400; // a tap this soon after a send is a double tap: ignored, the turn just sent goes on
const MUSIC_AT_MS = 2500; // no first sentence by then: Nani is really late, the wait music starts
const MUSIC_FADE_IN_MS = 300;
const MUSIC_FADE_OUT_MS = 250; // from the moment her first sentence is ready, wherever the music is
const SLOW_BRAIN_AT_MS = 8000; // give up: slow_brain line ("Ek baar phir bolo"), abort the request
const SFX_GAIN = 0.6;
// The music's level (about 12 dB under Nani's live voice) is in the file itself: it plays at gain 1.

export interface TalkStats {
  turn: number;
  heard?: string;
  reaction?: string; // the reaction clip played at the send tap
  reactionMs?: number; // send tap -> reaction clip started
  firstSayMs?: number; // send tap -> first `say` line arrived (her first sentence is ready)
  firstVoiceMs?: number; // send tap -> Nani's first sentence started playing (heard)
  musicAtMs?: number; // send tap -> wait music started (only when she was late)
  musicFadeLagMs?: number; // first sentence ready (or the fallback) -> the wait music silent
  server?: { stt: number; brainFirst: number; voiceFirst: number; total: number };
  fallback?: FallbackId;
}

export interface TalkDeps {
  player: NaniPlayer;
  setEyes: (e: EyeState) => void;
  sendWall: <E extends "cue" | "thinking" | "speaking" | "timings">(event: E, payload: WallPayload<E>) => void;
  mic: () => MediaStream | null;
  sessionId: () => string;
  lastEvent: () => NaniEvent | null;
  clockOffsetMs: () => number;
  showTimings: () => boolean;
  onStats: (s: TalkStats) => void;
  onRecording: (on: boolean) => void;
  /** N2: Nani's reply had [[call mumma]] / [[call papa]]; called once the reply has finished playing. */
  onCall?: (who: "mumma" | "papa") => void;
  /** R1: a sentence of Nani's reply started playing (the stage's caption). */
  onSaying?: (text: string) => void;
}

interface Item {
  i: number;
  text: string;
  cues: Cue[];
  buffer: Promise<AudioBuffer | null>; // decoded on arrival, played in queue order
}

interface Turn {
  n: number;
  ac: AbortController;
  t0: number;
  timers: ReturnType<typeof setTimeout>[];
  reaction: Clip | null; // the reaction at the send tap (under 1 s)
  music: Clip | null; // the wait music, if Nani was late
  voiceStarted: boolean; // Nani's reply (or a fallback) has arrived: no more wait clips
  speaking: boolean; // the reaction has finished: sentences may play
  ending: boolean; // a fallback line will close the turn
  queue: Item[];
  playing: boolean;
  serverDone: boolean;
  over: boolean;
  stats: TalkStats;
  call?: "mumma" | "papa"; // a call cue in this reply
}

interface Recording {
  rec: MediaRecorder;
  parts: Blob[];
  mime: string;
  at: number;
}

export class TalkLoop {
  private picker = new WaitPicker();
  private rec: Recording | null = null;
  private turn: Turn | null = null;
  private turnNo = 0;
  private sentAt = -Infinity; // when the last spoken turn was sent (performance.now())
  private musicLoad: Promise<AudioBuffer | null> | null = null;
  private musicBuffer: AudioBuffer | null = null;
  /** What the wall shows now; sent with every turn. */
  readonly board: BoardState = { spell: null, showing: null };
  /** Today's letter and theme (planner.md). Kept for use-talk.ts; since R3 no waiting clip depends on it. */
  today: Today | null = null;

  constructor(private d: TalkDeps) {}

  setToday(t: Today | null): void {
    this.today = t;
  }

  get busy(): boolean {
    return !!this.turn || !!this.rec;
  }

  /** The microphone is recording a turn (tap to talk: the next tap sends). */
  get recording(): boolean {
    return !!this.rec;
  }

  // ---------- paw ----------

  press(): void {
    if (this.rec) return;
    const sinceSend = performance.now() - this.sentAt;
    if (sinceSend < AFTER_SEND_MS) {
      // A double tap on send would abort the turn just sent and open a recording the 15 s cap then sends.
      // Nani can't be speaking her reply yet, so no barge-in is lost; later taps barge in as before.
      console.log(`[toy] tap ignored: ${Math.round(sinceSend)} ms after a send`);
      return;
    }
    this.stop(); // barge-in: stop Nani at once and abort the request
    const mic = this.d.mic();
    if (!mic) return;
    const mime = pickMime();
    let rec: MediaRecorder;
    try {
      rec = mime ? new MediaRecorder(mic, { mimeType: mime }) : new MediaRecorder(mic);
    } catch (e) {
      console.warn("[toy] recorder failed", e);
      return;
    }
    const r: Recording = { rec, parts: [], mime: rec.mimeType || mime || "audio/webm", at: performance.now() };
    rec.ondataavailable = (e) => {
      if (e.data.size) r.parts.push(e.data);
    };
    rec.start();
    this.rec = r;
    this.d.onRecording(true);
    this.d.setEyes("listening");
  }

  release(): void {
    const r = this.rec;
    if (!r) return;
    this.rec = null;
    this.d.onRecording(false);
    const held = performance.now() - r.at;
    const blob = new Promise<Blob>((resolve) => {
      r.rec.onstop = () => resolve(new Blob(r.parts, { type: r.mime }));
    });
    r.rec.stop();
    if (held < MIN_PRESS_MS) {
      this.d.setEyes("idle");
      return;
    }
    this.sentAt = performance.now();
    void this.run({ audio: blob, filename: `turn.${extOf(r.mime)}` });
  }

  /**
   * Drop the recording without sending it: a call took over the paw. The eyes go through the same setEyes as
   * every other path, so the talk state leaves "listening" ("calling" is talk state "idle", and R4's reminder
   * gate opens again), while the face keeps showing the call that has just set it.
   */
  cancel(): void {
    const r = this.rec;
    if (!r) return;
    this.rec = null;
    this.d.onRecording(false);
    try {
      r.rec.stop();
    } catch {}
    this.d.setEyes("calling");
  }

  /** A typed turn (no microphone, or testing): the same path as a spoken one. */
  say(text: string): void {
    if (!text.trim()) return;
    this.stop();
    void this.run({ text: text.trim() });
  }

  /** Stop all sound and the current turn. */
  stop(): void {
    this.d.player.stopAll();
    const t = this.turn;
    if (!t) return;
    t.ac.abort();
    this.finish(t);
  }

  // ---------- one turn ----------

  private async run(input: { audio?: Promise<Blob>; filename?: string; text?: string }): Promise<void> {
    const t: Turn = {
      n: ++this.turnNo,
      ac: new AbortController(),
      t0: performance.now(),
      timers: [],
      reaction: null,
      music: null,
      voiceStarted: false,
      speaking: false,
      ending: false,
      queue: [],
      playing: false,
      serverDone: false,
      over: false,
      stats: { turn: this.turnNo },
    };
    this.turn = t;

    // A calm reaction, at once.
    const reaction = this.picker.reaction();
    t.reaction = reaction ? this.d.player.playId(reaction.id) : null;
    if (reaction && t.reaction) {
      t.stats.reaction = reaction.id;
      t.stats.reactionMs = Math.round(performance.now() - t.t0);
    }
    this.stats(t);
    this.d.setEyes("thinking");
    this.d.sendWall("thinking", { on: true });
    this.loadMusic();

    t.timers.push(
      setTimeout(() => this.startMusic(t), MUSIC_AT_MS),
      setTimeout(() => {
        if (t.over || t.voiceStarted) return;
        t.ac.abort();
        void this.endWith(t, "slow_brain");
      }, SLOW_BRAIN_AT_MS),
    );

    try {
      const fd = new FormData();
      if (input.text) fd.append("text", input.text);
      else if (input.audio) fd.append("audio", await input.audio, input.filename ?? "turn.webm");
      fd.append("sessionId", this.d.sessionId());
      fd.append("board", JSON.stringify(this.board));
      fd.append("lastEvent", JSON.stringify(this.d.lastEvent()));
      fd.append("clockOffsetMs", String(this.d.clockOffsetMs()));
      const res = await fetch("/api/turn", { method: "POST", body: fd, signal: t.ac.signal });
      if (!res.ok || !res.body) throw new Error(`turn ${res.status}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (line) this.handle(t, JSON.parse(line) as TurnEvent);
        }
      }
      if (!t.over && !t.serverDone) {
        // the stream ended without `done`
        if (!t.voiceStarted) void this.endWith(t, "slow_brain");
        else this.serverDone(t);
      }
    } catch (e) {
      if (t.ac.signal.aborted || t.over) return;
      console.warn("[toy] turn failed", e);
      void this.endWith(t, navigator.onLine ? "slow_brain" : "offline");
    }
  }

  private handle(t: Turn, ev: TurnEvent): void {
    if (t.over) return;
    switch (ev.t) {
      case "heard":
        t.stats.heard = ev.text;
        this.stats(t);
        break;
      case "say":
        if (t.stats.firstSayMs === undefined) {
          t.stats.firstSayMs = Math.round(performance.now() - t.t0);
          this.stats(t);
        }
        for (const c of ev.cues) if (c.type === "call") t.call = c.who;
        t.queue.push({ i: ev.i, text: ev.text, cues: ev.cues, buffer: ev.audio ? this.d.player.decode(b64ToBuffer(ev.audio)) : Promise.resolve(null) });
        if (!t.voiceStarted) void this.startVoice(t);
        else this.playNext(t);
        break;
      case "fallback":
        void this.endWith(t, ev.id);
        break;
      case "done":
        t.stats.server = ev.ms;
        this.stats(t);
        console.log(`[toy] turn ${t.n}`, { ...t.stats });
        this.d.sendWall("timings", { show: this.d.showTimings(), ms: ev.ms });
        this.serverDone(t);
        break;
    }
  }

  private serverDone(t: Turn): void {
    t.serverDone = true;
    if (t.speaking && !t.ending && !t.playing && t.queue.length === 0) this.finish(t);
  }

  // ---------- waiting ----------

  /**
   * Once per page, after the wake tap: a copy of wait_music with a 300 ms fade-in written into its first
   * samples. The file itself is one seamless loop, so the fade lives here, not in the file.
   */
  private loadMusic(): void {
    if (this.musicLoad) return;
    const e = audioById(WAIT_MUSIC_ID);
    if (!e) return;
    this.musicLoad = this.d.player.load(e.file).then((b) => {
      if (!b) {
        this.musicLoad = null; // no audio context yet, or offline: try again next turn
        return null;
      }
      const n = Math.min(b.length, Math.round((b.sampleRate * MUSIC_FADE_IN_MS) / 1000));
      for (let c = 0; c < b.numberOfChannels; c++) {
        const x = b.getChannelData(c);
        for (let i = 0; i < n; i++) x[i] *= i / n;
      }
      this.musicBuffer = b;
      return b;
    });
  }

  /** Nani is really late: the wait music fades in. The wall keeps its thinking scene. */
  private startMusic(t: Turn): void {
    if (t.over || t.voiceStarted) return;
    // Without the faded copy (still loading), the plain file: same level, no fade-in.
    t.music = this.musicBuffer ? this.d.player.play(this.musicBuffer, WAIT_MUSIC_ID) : this.d.player.playId(WAIT_MUSIC_ID);
    if (!t.music) return;
    t.stats.musicAtMs = Math.round(performance.now() - t.t0);
    this.stats(t);
    console.log(`[toy] turn ${t.n} wait music at ${t.stats.musicAtMs} ms`);
  }

  /** Fade the wait music out (250 ms) from wherever it is. Resolves when it is silent. */
  private fadeMusic(t: Turn): Promise<void> {
    const m = t.music;
    if (!m?.playing()) return Promise.resolve();
    const from = performance.now();
    return m.fade(MUSIC_FADE_OUT_MS).then(() => {
      t.stats.musicFadeLagMs = Math.round(performance.now() - from);
      this.stats(t);
    });
  }

  /**
   * Nani's first sentence is ready: it plays now, with the wait music fading out under it. Only a reaction
   * still playing (under 1 s, from the send tap) finishes first. Then play the queue.
   */
  private async startVoice(t: Turn): Promise<void> {
    if (t.voiceStarted || t.over) return;
    t.voiceStarted = true;
    this.clearTimers(t);
    this.d.sendWall("thinking", { on: false });
    void this.fadeMusic(t);
    if (t.reaction?.playing()) await t.reaction.ended;
    if (t.over) return;
    t.speaking = true;
    this.d.setEyes("speaking");
    this.d.sendWall("speaking", { on: true });
    this.playNext(t);
  }

  private playNext(t: Turn): void {
    if (t.over || t.playing || !t.speaking) return;
    const item = t.queue.shift();
    if (!item) {
      if (t.serverDone && !t.ending) this.finish(t);
      return;
    }
    t.playing = true;
    void (async () => {
      const buffer = await item.buffer;
      if (t.over) return;
      // At the start of each sentence: its cues go to the wall, with sound effects.
      for (const c of item.cues) {
        this.d.sendWall("cue", { cue: c });
        this.track(c);
        if (c.type === "tile") this.d.player.playId(c.result === "right" ? "sfx_tada" : "sfx_oops", SFX_GAIN);
        if (c.type === "cheer") this.d.player.playId("sfx_cheer", SFX_GAIN);
      }
      // Animal sounds first, then the speech, then the song if asked for.
      for (const c of item.cues) {
        if (c.type !== "sound") continue;
        const clip = this.d.player.playId(`animal_${c.name}`);
        if (clip) await clip.ended;
        if (t.over) return;
      }
      if (buffer) {
        const clip = this.d.player.play(buffer, `say_${item.i}`);
        if (clip && item.text) this.d.onSaying?.(item.text);
        if (clip && t.stats.firstVoiceMs === undefined) {
          t.stats.firstVoiceMs = Math.round(performance.now() - t.t0);
          this.stats(t);
        }
        if (clip) await clip.ended;
        if (t.over) return;
      }
      if (item.cues.some((c) => c.type === "song")) {
        const clip = this.d.player.playId("song");
        if (clip) await clip.ended;
        if (t.over) return;
      }
      t.playing = false;
      this.playNext(t);
    })();
  }

  /** End the turn with a pre-made fallback line, after the sentence playing now (if any). */
  private async endWith(t: Turn, id: FallbackId): Promise<void> {
    if (t.over || t.ending) return;
    t.ending = true;
    t.stats.fallback = id;
    this.stats(t);
    t.serverDone = true;
    t.queue = [];
    this.clearTimers(t);
    if (!t.voiceStarted) {
      t.voiceStarted = true;
      this.d.sendWall("thinking", { on: false });
    }
    await Promise.all([this.fadeMusic(t), t.reaction?.playing() ? t.reaction.fade(200) : undefined]);
    while (t.playing && !t.over) await new Promise((r) => setTimeout(r, 50));
    if (t.over) return;
    t.playing = true;
    this.d.setEyes("speaking");
    const clip = this.d.player.playId(id);
    if (clip) await clip.ended;
    t.playing = false;
    this.finish(t);
  }

  private finish(t: Turn): void {
    if (t.over) return;
    t.over = true;
    this.clearTimers(t);
    void this.fadeMusic(t); // never left running (a barge-in has already stopped it)
    console.log(`[toy] turn ${t.n} end`, { ...t.stats, aborted: t.ac.signal.aborted });
    this.d.sendWall("thinking", { on: false });
    this.d.sendWall("speaking", { on: false });
    if (this.turn === t) this.turn = null;
    if (!this.rec) this.d.setEyes(navigator.onLine ? "idle" : "offline");
    if (t.call && !t.ac.signal.aborted && !this.rec) this.d.onCall?.(t.call); // not after a barge-in
  }

  private clearTimers(t: Turn): void {
    for (const id of t.timers) clearTimeout(id);
    t.timers = [];
  }

  private track(c: Cue): void {
    const b = this.board;
    if (c.type === "spell") b.spell = { word: c.word, gap: c.gap, tiles: c.tiles, filled: false };
    else if (c.type === "tile" && c.result === "right" && b.spell) b.spell = { ...b.spell, filled: true };
    if (c.type === "show" || c.type === "count" || c.type === "choices" || c.type === "cheer" || c.type === "spell") b.showing = c;
  }

  private stats(t: Turn): void {
    if (this.turn === t || t.over) this.d.onStats({ ...t.stats });
  }
}

function pickMime(): string {
  const options = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return options.find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) ?? "";
}

function extOf(mime: string): string {
  return mime.includes("mp4") ? "mp4" : mime.includes("ogg") ? "ogg" : "webm";
}

function b64ToBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let k = 0; k < bin.length; k++) out[k] = bin.charCodeAt(k);
  return out.buffer;
}

