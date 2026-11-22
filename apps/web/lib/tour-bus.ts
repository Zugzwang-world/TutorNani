// The stage's tour hook (TOUR brief, contract 3). A module-level bus: the real stage emits what happens (Nani
// speaking, wall cues, chat rows, turn done, "say again") and registers commands (send a line, tap a bubble,
// play a recorded turn); the tour (app/tour) listens and calls them. With no tour on the page nothing listens
// and every emit is a no-op, so /stage behaves exactly as before. Pure; client-safe.
// Contracts: docs/plan/CONTRACTS.md "Tour contracts".
import type { ReportView } from "@/components/report/types";
import type { BotKey, Cue, FallbackId, Message, TurnEvent } from "./types";

export type TourEvent =
  /** Nani's voice started (first sentence or a reminder) or ended (the turn or reminder is over). */
  | { type: "nani"; on: boolean; source: "turn" | "job" }
  /** One sentence of Nani's reply started playing (the caption text). */
  | { type: "saying"; i: number; text: string }
  /** The server heard Aarav's line (speech-to-text, or the typed text). */
  | { type: "heard"; text: string }
  /** A wall cue, at the moment the wall gets it. */
  | { type: "cue"; cue: Cue }
  /** A new chat row arrived (Realtime INSERT). Agents have sender_kind "bot" and sender = BotKey. */
  | { type: "chat"; message: Message }
  /** One talk turn is over (played to the end, a fallback, or stopped). `said` is Nani's sentences joined. */
  | { type: "turnDone"; heard?: string; said: string; fallback?: FallbackId; aborted: boolean }
  /** Nani asked him to say it again ("Ek baar phir bolo": the slow_brain or not_heard line). The turn stays open. */
  | { type: "sayAgain"; fallback: FallbackId }
  /** The talk state on the stage changed. */
  | { type: "status"; awake: boolean; listening: boolean; busy: boolean; mic: "ok" | "pending" | "blocked" }
  /** An agent profile opened (agent) or closed (null). */
  | { type: "profile"; agent: BotKey | null }
  /** The progress report opened on a view, or closed (null). */
  | { type: "report"; view: ReportView | null };

export interface TourCommands {
  /** Type `text` into Aarav's line box, letter by letter over about `ms` (default 700), then send it (a typed turn). */
  sendLine(text: string, opts?: { ms?: number }): Promise<void>;
  /** Type `text` into Aarav's line box (visual only, nothing is sent); the box clears when the next turn starts. */
  typeLine(text: string, opts?: { ms?: number }): Promise<void>;
  /** The same as tapping the talk button (first tap listens, the next sends; a tap while Nani speaks stops her). */
  tapPaw(): void;
  /** The same as tapping idea bubble `id` (content/demo.config.json `bubbles`): posts its line as its parent. */
  tapBubble(id: string): boolean;
  /** Play a recorded turn through the stage's own talk loop: no request, no reaction clip, no wait music.
   *  `say` events may carry `audioUrl` (an mp3 under /tour/audio) instead of base64 `audio`. */
  playTurn(events: RecordedTurnEvent[]): void;
  /** Unlock sound (the tour's "Meet Nani" tap is the user gesture). `mic: false` leaves the mic closed until tapPaw. */
  wake(opts?: { mic?: boolean }): void;
  /** Stop Nani at once (as a barge-in does). */
  stop(): void;
}

/** A TurnEvent from the tape: `say` lines may point at an mp3 instead of carrying base64 audio. */
export type RecordedTurnEvent = TurnEvent | { t: "say"; i: number; text: string; cues: Cue[]; audio?: string; audioUrl: string };

type Listener = (e: TourEvent) => void;
const listeners = new Set<Listener>();
const commands: Partial<TourCommands> = {};

/** The stage calls this at each event. No listener: nothing happens. */
export function tourEmit(e: TourEvent): void {
  if (!listeners.size) return;
  for (const fn of listeners) {
    try {
      fn(e);
    } catch (err) {
      console.warn("[tour] listener failed", err);
    }
  }
}

/** The tour listens here. Returns the unsubscribe. */
export function onTour(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Is a tour listening? (The stage may skip work for the tour when nothing listens.) */
export function tourActive(): boolean {
  return listeners.size > 0;
}

/** The stage registers a command; returns the unregister (call it on unmount). */
export function registerTourCommand<K extends keyof TourCommands>(name: K, fn: TourCommands[K]): () => void {
  commands[name] = fn;
  return () => {
    if (commands[name] === fn) delete commands[name];
  };
}

/** The tour calls the stage through this. A command the stage hasn't registered yet warns and does nothing. */
export const tour: TourCommands = {
  sendLine: (text, opts) => call("sendLine", text, opts) ?? Promise.resolve(),
  typeLine: (text, opts) => call("typeLine", text, opts) ?? Promise.resolve(),
  tapPaw: () => void call("tapPaw"),
  tapBubble: (id) => call("tapBubble", id) ?? false,
  playTurn: (events) => void call("playTurn", events),
  wake: (opts) => void call("wake", opts),
  stop: () => void call("stop"),
};

function call<K extends keyof TourCommands>(name: K, ...args: Parameters<TourCommands[K]>): ReturnType<TourCommands[K]> | undefined {
  const fn = commands[name] as ((...a: Parameters<TourCommands[K]>) => ReturnType<TourCommands[K]>) | undefined;
  if (!fn) {
    console.warn(`[tour] no stage command "${name}" yet`);
    return undefined;
  }
  return fn(...args);
}

/** Is the stage ready for commands (mounted and registered)? */
export function tourReady(name: keyof TourCommands = "sendLine"): boolean {
  return !!commands[name];
}
