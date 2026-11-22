"use client";
// Call mode on /toy (PLAN.md C11, N2). start(who) rings Mumma or Papa: eyes "calling", core.mode "call",
// Nani's call bubble in the chat (POST /api/call start). While the call is on, the paw records a clip for
// the call instead of talking to Nani (tap to start, tap to send), and the parent's clips play through the
// toy's speaker at once.
// It ends on the End button, the parent's End, or CALL_IDLE_MS with no clip either way.
import { useCallback, useEffect, useRef, useState } from "react";
import { callApi, ClipRecorder, sendClip } from "@/lib/call/client";
import { asWho, CALL_IDLE_MS, sentAtOf, whoLabel, type CallWho } from "@/lib/call/shared";
import { config } from "@/lib/config";
import type { Clip } from "@/lib/voice/player";
import type { ToyCore } from "./use-toy-core";

export interface ToyCall {
  callId: string | null; // null until /api/call start answers
  who: CallWho;
  state: "ringing" | "open";
  recording: boolean;
  sending: boolean;
  hearing: boolean; // a parent clip is playing
  clips: number;
}

export interface CallControls {
  call: ToyCall | null;
  /** Start a call. playLine: play line_call_<who> first (the routine path has already played it). */
  start: (who: CallWho, playLine: boolean) => void;
  end: (reason?: string) => void;
  press: () => void;
  release: () => void;
  /** Read at tap time (refs, never stale): a call is on / the paw is recording a clip. */
  active: () => boolean;
  recording: () => boolean;
}

export function useCall(core: ToyCore): CallControls {
  const { player, setEyes, setMode, micRef, lastEventRef, onToy } = core;
  const [call, setCallState] = useState<ToyCall | null>(null);
  const ref = useRef<ToyCall | null>(null);
  const recRef = useRef(new ClipRecorder());
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hearing = useRef<Clip | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const endRef = useRef<(reason?: string) => void>(() => {});

  const setCall = useCallback((next: ToyCall | null) => {
    ref.current = next;
    setCallState(next);
  }, []);
  const patch = useCallback(
    (p: Partial<ToyCall>) => {
      if (ref.current) setCall({ ...ref.current, ...p });
    },
    [setCall],
  );

  const armIdle = useCallback(() => {
    if (idle.current) clearTimeout(idle.current);
    idle.current = setTimeout(() => endRef.current("idle"), CALL_IDLE_MS);
  }, []);

  /** Back to talking with Nani. Safe to call more than once. */
  const finishLocal = useCallback(() => {
    const c = ref.current;
    if (!c) return;
    if (idle.current) clearTimeout(idle.current);
    recRef.current.cancel();
    hearing.current?.stop();
    hearing.current = null;
    lastEventRef.current = { kind: "call", text: `Call with ${whoLabel(c.who)} ended`, at: new Date().toISOString() };
    setCall(null);
    setMode("talk");
    setEyes(navigator.onLine ? "idle" : "offline");
    console.log(`[call] ended on the toy (${c.clips} clips)`);
  }, [lastEventRef, setCall, setEyes, setMode]);

  const end = useCallback(
    (reason = "tap") => {
      const c = ref.current;
      if (!c) return;
      finishLocal();
      if (c.callId) void callApi("end", { callId: c.callId, reason });
    },
    [finishLocal],
  );
  useEffect(() => {
    endRef.current = end;
  }, [end]);

  const start = useCallback(
    (who: CallWho, playLine: boolean) => {
      if (ref.current) return; // one call at a time
      player.stopAll();
      setCall({ callId: null, who, state: "ringing", recording: false, sending: false, hearing: false, clips: 0 });
      setMode("call");
      setEyes("calling");
      lastEventRef.current = { kind: "call", text: `Calling ${whoLabel(who)}`, at: new Date().toISOString() };
      if (playLine) player.playId(`line_call_${who}`);
      armIdle();
      void callApi("start", { who }).then((r) => {
        if (!ref.current) {
          // Ended before the server answered: close the call it just opened.
          if (r.ok && r.callId) void callApi("end", { callId: r.callId, reason: "tap" });
          return;
        }
        if (!r.ok || !r.callId) {
          console.warn("[call] start failed", r.error);
          finishLocal();
          player.playId(navigator.onLine ? "voice_failed" : "offline");
          return;
        }
        patch({ callId: r.callId });
      });
    },
    [armIdle, finishLocal, lastEventRef, patch, player, setCall, setEyes, setMode],
  );

  // The parent's side: joined, ended, and their clips.
  useEffect(() => {
    const offCall = onToy("call", (p) => {
      const c = ref.current;
      if (!c && p.state === "ringing") {
        // A call started somewhere else (presenter, POST /api/call start): the toy rings and takes it.
        const who = asWho(p.who);
        player.stopAll();
        setCall({ callId: p.callId, who, state: "ringing", recording: false, sending: false, hearing: false, clips: 0 });
        setMode("call");
        setEyes("calling");
        lastEventRef.current = { kind: "call", text: `Calling ${whoLabel(who)}`, at: new Date().toISOString() };
        player.playId(`line_call_${who}`);
        armIdle();
        return;
      }
      if (!c || p.callId !== c.callId) return;
      if (p.state === "open" && c.state !== "open") {
        patch({ state: "open" });
        player.playId("sfx_pop", 0.7);
        armIdle();
      } else if (p.state === "ended") finishLocal();
    });
    const offClip = onToy("clip", (p) => {
      const c = ref.current;
      if (!c || p.from !== "parent" || p.callId !== c.callId) return;
      armIdle();
      const got = Date.now();
      // Download now, play in arrival order.
      const buffer = player.load(p.url);
      queue.current = queue.current.then(async () => {
        const b = await buffer;
        if (!ref.current || ref.current.callId !== p.callId) return;
        if (!b) return console.warn("[call] parent clip failed to load", p.url);
        while (recRef.current.active) await new Promise((r) => setTimeout(r, 100)); // Aarav is talking: play after
        if (!ref.current || ref.current.callId !== p.callId) return;
        const clip = player.play(b, "call_clip");
        if (!clip) return;
        const sent = sentAtOf(p.url);
        console.log(
          `[call] clip from parent played: broadcast→playing ${Date.now() - got} ms` + (sent ? `, stored→playing ${Date.now() - sent} ms` : ""),
        );
        hearing.current = clip;
        patch({ hearing: true });
        setEyes("speaking");
        await clip.ended;
        if (hearing.current === clip) hearing.current = null;
        if (ref.current) {
          patch({ hearing: false });
          if (!recRef.current.active) setEyes("calling");
        }
      });
    });
    return () => {
      offCall();
      offClip();
    };
  }, [armIdle, finishLocal, lastEventRef, onToy, patch, player, setCall, setEyes, setMode]);

  const release = useCallback(() => {
    const c = ref.current;
    if (!c || !recRef.current.active) return;
    patch({ recording: false });
    setEyes("calling");
    void recRef.current.stop().then(async (r) => {
      const cur = ref.current;
      if (!r || !cur?.callId) return;
      armIdle();
      patch({ sending: true });
      const sent = await sendClip(r, cur.callId, "toy", config.childName);
      if (ref.current?.callId === cur.callId) patch({ sending: false, clips: ref.current.clips + (sent ? 1 : 0) });
    });
  }, [armIdle, patch, setEyes]);

  const press = useCallback(() => {
    const c = ref.current;
    const mic = micRef.current;
    if (!c || !mic || recRef.current.active) return;
    hearing.current?.stop(); // barge-in on the parent's clip
    if (!recRef.current.start(mic, () => release())) return;
    patch({ recording: true });
    setEyes("listening");
  }, [micRef, patch, release, setEyes]);

  useEffect(
    () => () => {
      if (idle.current) clearTimeout(idle.current);
    },
    [],
  );

  const active = useCallback(() => !!ref.current, []);
  const recording = useCallback(() => recRef.current.active, []);

  return { call, start, end, press, release, active, recording };
}
