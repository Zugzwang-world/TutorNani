"use client";
// One toy per page (R1): the core, the talking loop, the call, the routine clock, and tap to talk.
// /toy and /stage both use it, so the wiring (and the routine) is the same on both.
//
// Tap to talk: one tap (or the space bar, never while typing in a text box) starts listening, the next tap
// sends, and a recording sends by itself after TAP_SEND_MS. A tap while Nani speaks stops her and listens
// (barge-in). During a call the same taps record the walkie-talkie clip. The very first tap only wakes Nani
// (unlocks sound and the mic). Toy contract: the first tap is ptt_start, the second is ptt_end.
import { useCallback, useEffect, useRef } from "react";
import { AUDIO } from "@/lib/audio";
import type { WallBus } from "@/lib/wall-bus";
import { useCall } from "./use-call";
import { useRoutine } from "./use-routine";
import { useTalk } from "./use-talk";
import { useToyCore } from "./use-toy-core";

/** A recording (talk or call) sends by itself after this long. */
export const TAP_SEND_MS = 15_000;
/** The wake guard clears by itself after this long, so a resume() that never settles can't block later taps. */
const WAKE_GUARD_MS = 2000;

/** A text box has focus: the space bar and the stage shortcuts leave the keys alone. */
export function isTextBox(el: Element | EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || el.isContentEditable;
}

export function useToy(opts: { bus?: WallBus } = {}) {
  const core = useToyCore({ bus: opts.bus });
  const { lastEventRef } = core;
  const call = useCall(core);
  // N2: a [[call mumma]] cue starts the call once Nani has finished that reply.
  const t = useTalk(core, { onCall: (who) => call.start(who, true) });
  const talk = t.talk;

  // G4, R4: routine jobs (reminders, calls, brief, song) fire on the demo clock through the toy's speaker. A due job
  // waits until the page is awake and Nani is idle (not listening, thinking or speaking) with no call open.
  const { talkStateRef } = t;
  const routine = useRoutine({
    enabled: core.awake,
    isIdle: () => talkStateRef.current === "idle" && !call.active(),
    talkState: `${t.talkState}:${core.mode}`,
    onCall: (who) => call.start(who, false), // the routine has already played line_call_<who>
    play: async (url) => {
      const pre = AUDIO.find((a) => a.file === url);
      const clip = pre ? core.player.playId(pre.id) : await core.player.load(url).then((b) => (b ? core.player.play(b, "routine") : null));
      if (!clip) return;
      core.setEyes("speaking");
      await clip.ended;
      core.setEyes("idle");
    },
    setLastEvent: (e) => {
      lastEventRef.current = e;
    },
  });

  // ---------- the 15 s send ----------
  const cap = useRef<{ n: number; id: ReturnType<typeof setTimeout> } | null>(null);
  const capSeq = useRef(0);
  const clearCap = useCallback(() => {
    if (cap.current) clearTimeout(cap.current.id);
    cap.current = null;
  }, []);
  /** Arm the cap for the recording that just started; any tap clears it, so a stale one never sends a later recording. */
  const armCap = useCallback(
    (send: () => void) => {
      clearCap();
      const n = ++capSeq.current;
      cap.current = {
        n,
        id: setTimeout(() => {
          if (cap.current?.n !== n) return;
          cap.current = null;
          console.log(`[toy] ${TAP_SEND_MS / 1000} s: sending by itself`);
          send();
        }, TAP_SEND_MS),
      };
    },
    [clearCap],
  );
  useEffect(() => clearCap, [clearCap]);

  // A call took over the paw: drop a talk recording that is still open (else the cap would send a turn mid-call).
  useEffect(() => {
    if (core.mode !== "call" || !talk.recording()) return;
    clearCap();
    talk.cancel();
  }, [core.mode, talk, clearCap]);

  // ---------- the tap ----------
  const awakeRef = useRef(core.awake);
  useEffect(() => {
    awakeRef.current = core.awake;
  });
  const waking = useRef(false);
  const { micRef } = core;
  /** Unlock sound and open the mic. Awake without a mic stream (prompt unanswered, or refused): asks for the mic again. */
  /** Guard one wake at a time; it clears after WAKE_GUARD_MS even if AudioContext.resume() never settles, so a later tap can retry. */
  const guardWake = useCallback((then?: () => void) => {
    waking.current = true;
    let done = false;
    const clear = () => {
      if (done) return;
      done = true;
      waking.current = false;
    };
    const id = setTimeout(clear, WAKE_GUARD_MS);
    void core.wake().finally(() => {
      clearTimeout(id);
      clear();
      then?.();
    });
  }, [core]);
  const wake = useCallback(() => {
    if (waking.current || (awakeRef.current && micRef.current)) return;
    guardWake();
  }, [guardWake, micRef]);

  const tapRef = useRef<() => void>(() => {});
  useEffect(() => {
    tapRef.current = () => {
      if (!awakeRef.current) return wake(); // the first tap only unlocks sound and the mic
      if (!micRef.current) {
        // The permission prompt is still up (or the mic was refused): never a silent no-op; ask again.
        console.log("[toy] tap: no microphone yet, asking again");
        return wake();
      }
      if (call.active()) {
        if (call.recording()) {
          clearCap();
          call.release();
        } else {
          call.press();
          if (call.recording()) armCap(() => call.release());
        }
        return;
      }
      if (talk.recording()) {
        clearCap();
        talk.release(); // ptt_end
      } else {
        talk.press(); // ptt_start (and barge-in: stops Nani first)
        if (talk.recording()) armCap(() => talk.release());
      }
    };
  });
  const tap = useCallback(() => tapRef.current(), []);

  /** A typed line for Aarav (the stage's text box, /toy?type): the same path as a spoken turn. */
  const say = useCallback(
    (text: string) => {
      if (!text.trim() || call.active()) return;
      // An open recording would send a second turn on the next tap (two brain requests, overlapping audio): drop it.
      if (talk.recording()) talk.cancel();
      clearCap();
      if (awakeRef.current) return talk.say(text);
      // Typing first also wakes Nani (Enter is a user gesture), then says the line.
      guardWake(() => talk.say(text));
    },
    [call, clearCap, guardWake, talk],
  );

  // The space bar taps (not while typing, not with a modifier: Alt+… are the stage's shortcuts). Both keydown and
  // keyup are swallowed so a focused button is never clicked by the space bar as well.
  useEffect(() => {
    const ours = (e: KeyboardEvent) => e.code === "Space" && !e.altKey && !e.ctrlKey && !e.metaKey && !isTextBox(e.target);
    const kd = (e: KeyboardEvent) => {
      if (!ours(e)) return;
      e.preventDefault();
      if (!e.repeat) tapRef.current();
    };
    const ku = (e: KeyboardEvent) => {
      if (ours(e)) e.preventDefault();
    };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
  }, []);

  const listening = call.call ? call.call.recording : t.recording;
  /** "pending": awake but the mic prompt is unanswered; "blocked": refused or missing (type instead). */
  const mic: "ready" | "pending" | "blocked" = core.micReady ? "ready" : core.micError ? "blocked" : "pending";

  return {
    mic,
    core,
    call,
    talk,
    routine,
    stats: t.stats,
    /** The paw is recording (a turn, or a call clip): the label says "Listening… tap to send". */
    listening,
    /** R4: hold reminders until this is "idle" (talkStateRef for reads inside timers). */
    talkState: t.talkState,
    talkStateRef: t.talkStateRef,
    /** The caption: what Aarav said this turn, then the sentence Nani is saying now. */
    heard: t.stats.heard,
    naniSaying: t.naniSaying,
    tap,
    wake,
    say,
  };
}

export type Toy = ReturnType<typeof useToy>;
