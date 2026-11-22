"use client";
// React wrapper around TalkLoop: one loop per page, wired to the toy core.
import { useEffect, useRef, useState, type RefObject } from "react";
import { watchToday } from "./fillers";
import { TalkLoop, type TalkStats } from "./talk-loop";
import type { EyeState, ToyCore } from "./use-toy-core";

/** What the talking loop is doing (R1). R4 holds reminders until it is "idle". Calls and reminders don't change it. */
export type TalkState = "idle" | "listening" | "thinking" | "speaking";

export interface Talk {
  press: () => void;
  release: () => void;
  say: (text: string) => void;
  stop: () => void;
  /** Drop an open recording without sending it. */
  cancel: () => void;
  /** True while the microphone records a turn (read at tap time, never stale). */
  recording: () => boolean;
}

const toTalkState = (e: EyeState): TalkState => (e === "listening" || e === "thinking" || e === "speaking" ? e : "idle");

export function useTalk(core: ToyCore, opts: { onCall?: (who: "mumma" | "papa") => void } = {}) {
  const onCallRef = useRef(opts.onCall);
  useEffect(() => {
    onCallRef.current = opts.onCall;
  });
  const [stats, setStats] = useState<TalkStats>({ turn: 0 });
  const [recording, setRecording] = useState(false);
  const [talkState, setTalkState] = useState<TalkState>("idle");
  const talkStateRef = useRef<TalkState>("idle");
  const [saying, setSaying] = useState<{ turn: number; text: string } | null>(null);
  const turnRef = useRef(0);
  const loopRef = useRef<TalkLoop | null>(null);
  const { player, setEyes, sendWall, micRef, sessionIdRef, lastEventRef, clockOffsetRef, showTimingsRef } = core;

  useEffect(() => {
    const loop = new TalkLoop({
      player,
      setEyes: (e) => {
        setEyes(e);
        const st = toTalkState(e);
        talkStateRef.current = st;
        setTalkState(st);
      },
      sendWall,
      mic: () => micRef.current,
      sessionId: () => sessionIdRef.current,
      lastEvent: () => {
        // Sent once: the turn right after a reminder knows about it; later turns don't.
        const e = lastEventRef.current;
        lastEventRef.current = null;
        return e;
      },
      clockOffsetMs: () => clockOffsetRef.current,
      showTimings: () => showTimingsRef.current,
      onStats: (s) => {
        turnRef.current = s.turn;
        setStats(s);
      },
      onRecording: setRecording,
      onCall: (who) => onCallRef.current?.(who),
      onSaying: (text) => setSaying({ turn: turnRef.current, text }),
    });
    loopRef.current = loop;
    const stopToday = watchToday((t) => loop.setToday(t));
    return () => {
      stopToday();
      loop.stop();
      loopRef.current = null;
    };
  }, [player, setEyes, sendWall, micRef, sessionIdRef, lastEventRef, clockOffsetRef, showTimingsRef]);

  const [talk] = useState<Talk>(() => ({
    press: () => loopRef.current?.press(),
    release: () => loopRef.current?.release(),
    say: (text) => loopRef.current?.say(text),
    stop: () => loopRef.current?.stop(),
    cancel: () => loopRef.current?.cancel(),
    recording: () => !!loopRef.current?.recording,
  }));
  // Nani's sentence belongs to the turn it came from: a new turn clears it.
  const naniSaying = saying && saying.turn === stats.turn ? saying.text : null;
  return { talk, stats, recording, talkState, talkStateRef: talkStateRef as RefObject<TalkState>, naniSaying };
}
