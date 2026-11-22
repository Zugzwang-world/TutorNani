// Web Audio player for /toy (browser only). One AudioContext, the pre-made clips decoded up front, and
// simple handles for playing, fading and stopping. Missing ids are skipped quietly (manifest may be []).
import type { AudioEntry } from "../types";
import { cutPoints, findPauses, type Pause } from "./pauses";

export interface Clip {
  id: string;
  duration: number; // seconds
  /** Seconds left to play (0 once ended). */
  remaining(): number;
  /** Seconds played so far. */
  position(): number;
  playing(): boolean;
  stop(): void;
  /** Fade to silence over `ms`, then stop. Resolves when silent. */
  fade(ms?: number): Promise<void>;
  /** Stop with a short fade when playback reaches `pos` seconds (on the audio clock). Resolves when silent. */
  stopAt(pos: number, ms?: number): Promise<void>;
  /** Resolves when the clip ends, is stopped or fades out. */
  ended: Promise<void>;
}

type AudioSessionNavigator = Navigator & { audioSession?: { type: string } };

export class NaniPlayer {
  private ctx: AudioContext | null = null;
  private raw = new Map<string, Promise<ArrayBuffer | null>>();
  private buffers = new Map<string, AudioBuffer>();
  private live = new Set<Clip>();
  private entries: AudioEntry[] = [];
  private cuts = new Map<string, Pause[]>();

  /** Start downloading the manifest files at page load (no AudioContext needed yet). */
  prefetch(entries: AudioEntry[]): void {
    this.entries = entries;
    for (const e of entries) {
      if (this.raw.has(e.id)) continue;
      this.raw.set(
        e.id,
        fetch(e.file)
          .then((r) => (r.ok ? r.arrayBuffer() : null))
          .catch(() => null),
      );
    }
  }

  /** Call inside a user gesture ("Tap to wake Nani"). Creates and resumes the context, decodes every clip. */
  async unlock(): Promise<void> {
    const nav = navigator as AudioSessionNavigator;
    // iOS: play through the silent switch and keep the mic usable.
    if (nav.audioSession) {
      try {
        nav.audioSession.type = "play-and-record";
      } catch {}
    }
    if (!this.ctx) this.ctx = new AudioContext({ latencyHint: "interactive" });
    const resumed = this.ctx.state !== "running" ? this.ctx.resume().catch(() => {}) : Promise.resolve();
    // A silent blip, still inside the gesture, fully unlocks iOS Safari.
    const blip = this.ctx.createBufferSource();
    blip.buffer = this.ctx.createBuffer(1, 1, 22050);
    blip.connect(this.ctx.destination);
    blip.start();
    await resumed;
    await Promise.all(
      this.entries.map(async (e) => {
        if (this.buffers.has(e.id)) return;
        const bytes = await this.raw.get(e.id);
        if (!bytes) return;
        try {
          this.buffers.set(e.id, await this.ctx!.decodeAudioData(bytes.slice(0)));
        } catch {}
      }),
    );
    for (const e of this.entries) if (e.kind === "filler") this.cutPoints(e.id); // at wake, not at the 1.2 s filler
  }

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === "running";
  }

  has(id: string): boolean {
    return this.buffers.has(id);
  }

  /** Where a pre-made clip may stop early: its sentence ends (pauses.ts). Computed once per clip. */
  cutPoints(id: string): Pause[] {
    const known = this.cuts.get(id);
    if (known) return known;
    const b = this.buffers.get(id);
    if (!b) return [];
    const text = this.entries.find((e) => e.id === id)?.text;
    const c = cutPoints(text, findPauses(b.getChannelData(0), b.sampleRate));
    this.cuts.set(id, c);
    return c;
  }

  /** Decode Nani's live mp3 (bytes from a `say` event). */
  async decode(bytes: ArrayBuffer): Promise<AudioBuffer | null> {
    if (!this.ctx || bytes.byteLength === 0) return null;
    try {
      return await this.ctx.decodeAudioData(bytes);
    } catch {
      return null;
    }
  }

  /** Fetch and decode a clip by URL (e.g. an /api/say mp3). */
  async load(url: string): Promise<AudioBuffer | null> {
    try {
      const r = await fetch(url);
      return r.ok ? this.decode(await r.arrayBuffer()) : null;
    } catch {
      return null;
    }
  }

  /** Play a pre-made clip by id. Returns null (quietly) if the id is not in the manifest. */
  playId(id: string, gain = 1): Clip | null {
    const b = this.buffers.get(id);
    return b ? this.play(b, id, gain) : null;
  }

  play(buffer: AudioBuffer, id = "live", gain = 1): Clip | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    if (ctx.state !== "running") void ctx.resume();
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(ctx.destination);
    const startedAt = ctx.currentTime;
    let done = false;
    let resolveEnded!: () => void;
    const ended = new Promise<void>((r) => (resolveEnded = r));
    const finish = () => {
      if (done) return;
      done = true;
      this.live.delete(clip);
      resolveEnded();
    };
    src.onended = finish;
    const clip: Clip = {
      id,
      duration: buffer.duration,
      remaining: () => (done ? 0 : Math.max(0, buffer.duration - (ctx.currentTime - startedAt))),
      position: () => (done ? buffer.duration : Math.min(buffer.duration, ctx.currentTime - startedAt)),
      playing: () => !done,
      stop: () => {
        // Silence at once, even if an earlier scheduled stop (stopAt, fade) makes stop() throw.
        g.gain.cancelScheduledValues(ctx.currentTime);
        g.gain.setValueAtTime(0, ctx.currentTime);
        try {
          src.stop();
        } catch {}
        finish();
      },
      fade: (ms = 250) => {
        if (done) return Promise.resolve();
        const now = ctx.currentTime;
        g.gain.cancelScheduledValues(now);
        g.gain.setValueAtTime(g.gain.value, now);
        g.gain.linearRampToValueAtTime(0, now + ms / 1000);
        try {
          src.stop(now + ms / 1000 + 0.02);
        } catch {}
        return ended;
      },
      stopAt: (pos, ms = 60) => {
        if (done) return Promise.resolve();
        const at = Math.max(ctx.currentTime, startedAt + pos);
        g.gain.cancelScheduledValues(ctx.currentTime);
        g.gain.setValueAtTime(g.gain.value, at);
        g.gain.linearRampToValueAtTime(0, at + ms / 1000);
        try {
          src.stop(at + ms / 1000 + 0.02);
        } catch {}
        return ended;
      },
      ended,
    };
    this.live.add(clip);
    src.start();
    return clip;
  }

  /** Stop everything at once (barge-in). */
  stopAll(): void {
    for (const c of [...this.live]) c.stop();
  }
}
