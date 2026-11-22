"use client";
// The toy's shared core: player, eyes, mode, microphone, wall + toy channels, demo clock, last Nani event.
// Feature hooks take this core: useTalk(core) today; useRoutine(core) (G4) and a call mode (N2) plug in
// the same way. They listen to toy:<child> events with core.onToy(...) and drive the wall with core.sendWall(...).
// On /stage (R1) the core also gets the page's wall bus: every wall event goes on the bus for the stage's own
// <Wall bus>, and still out on wall:<child> for a projector on /home-base.
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { AUDIO } from "@/lib/audio";
import { CHILD_ID } from "@/lib/config";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { channelName, type NaniEvent, type ToyEvent, type WallEvent } from "@/lib/types";
import { NaniPlayer } from "@/lib/voice/player";
import type { WallBus, WallEvent as BusEvent } from "@/lib/wall-bus";

export type EyeState = "idle" | "listening" | "thinking" | "speaking" | "calling" | "offline";
/** What the paw does. "talk" is the talking loop; N2 adds "call". */
export type ToyMode = "talk" | "call";

type ToyEventName = ToyEvent["event"];
export type ToyPayload<E extends ToyEventName> = Extract<ToyEvent, { event: E }>["payload"];
type WallEventName = WallEvent["event"];
export type WallPayload<E extends WallEventName> = Extract<WallEvent, { event: E }>["payload"];

const TOY_EVENTS: ToyEventName[] = ["clock", "reset", "fire_next_job", "job", "call", "clip"];

export interface ToyCore {
  player: NaniPlayer;
  eyes: EyeState;
  setEyes: (e: EyeState) => void;
  mode: ToyMode;
  setMode: (m: ToyMode) => void;
  awake: boolean;
  /** Call from the "Tap to wake Nani" gesture: unlocks audio and opens the microphone once. */
  wake: () => Promise<void>;
  micRef: RefObject<MediaStream | null>;
  /** The microphone stream is open (false while the permission prompt is up, or when it was refused). */
  micReady: boolean;
  micError: string | null;
  sessionIdRef: RefObject<string>;
  /** The last thing Nani did on her own (e.g. a water reminder). G4 sets it; /api/turn reads it. */
  lastEventRef: RefObject<NaniEvent | null>;
  clockOffsetRef: RefObject<number>;
  showTimingsRef: RefObject<boolean>;
  sendWall: <E extends WallEventName>(event: E, payload: WallPayload<E>) => void;
  /** Listen to a toy:<child> broadcast event. Returns an unsubscribe function. */
  onToy: <E extends ToyEventName>(event: E, fn: (payload: ToyPayload<E>) => void) => () => void;
}

export function useToyCore(opts: { bus?: WallBus } = {}): ToyCore {
  const busRef = useRef<WallBus | undefined>(opts.bus);
  useEffect(() => {
    busRef.current = opts.bus;
  });
  const [player] = useState(() => new NaniPlayer());
  const [eyes, setEyes] = useState<EyeState>("idle");
  const [mode, setMode] = useState<ToyMode>("talk");
  const [awake, setAwake] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [micReady, setMicReady] = useState(false);
  const micRef = useRef<MediaStream | null>(null);
  const sessionIdRef = useRef<string>("");
  const lastEventRef = useRef<NaniEvent | null>(null);
  const clockOffsetRef = useRef(0);
  const showTimingsRef = useRef(false);
  const wallRef = useRef<RealtimeChannel | null>(null);
  const listeners = useRef(new Map<ToyEventName, Set<(p: unknown) => void>>());

  // One session per page load; clips start downloading before the wake tap.
  useEffect(() => {
    sessionIdRef.current = crypto.randomUUID();
    player.prefetch(AUDIO);
  }, [player]);

  // Channels: wall (send), toy (receive), demo_state (clock offset, timings switch).
  useEffect(() => {
    const sb = supabaseBrowser();
    const wall = sb.channel(channelName.wall(CHILD_ID)).subscribe();
    wallRef.current = wall;

    const toy = sb.channel(channelName.toy(CHILD_ID));
    for (const ev of TOY_EVENTS) {
      toy.on("broadcast", { event: ev }, ({ payload }) => {
        for (const fn of listeners.current.get(ev) ?? []) fn(payload);
      });
    }
    toy.subscribe();

    const applyState = (row: { clock_offset_ms?: number; show_timings?: boolean } | null) => {
      if (!row) return;
      if (typeof row.clock_offset_ms === "number") clockOffsetRef.current = row.clock_offset_ms;
      if (typeof row.show_timings === "boolean") showTimingsRef.current = row.show_timings;
    };
    sb.from("demo_state")
      .select("clock_offset_ms, show_timings")
      .eq("child_id", CHILD_ID)
      .maybeSingle()
      .then(({ data }) => applyState(data));
    const ds = sb
      .channel(`toy-demo-state-${CHILD_ID}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "demo_state", filter: `child_id=eq.${CHILD_ID}` }, (p) =>
        applyState(p.new as { clock_offset_ms?: number; show_timings?: boolean }),
      )
      .subscribe();

    return () => {
      wallRef.current = null;
      void sb.removeChannel(wall);
      void sb.removeChannel(toy);
      void sb.removeChannel(ds);
    };
  }, []);

  const onToy = useCallback(<E extends ToyEventName>(event: E, fn: (payload: ToyPayload<E>) => void) => {
    const set = listeners.current.get(event) ?? new Set();
    listeners.current.set(event, set);
    const f = fn as (p: unknown) => void;
    set.add(f);
    return () => {
      set.delete(f);
    };
  }, []);

  // Built-in toy events: reset reloads, clock moves the demo clock. With a bus, the stage's wall hears the
  // reset too (it clears today's stickers, then reloads), since it doesn't listen on wall:<child>.
  useEffect(() => {
    const offReset = onToy("reset", () => {
      busRef.current?.emit({ event: "reset" });
      location.reload();
    });
    const offClock = onToy("clock", (p) => {
      clockOffsetRef.current = p.offsetMs;
    });
    return () => {
      offReset();
      offClock();
    };
  }, [onToy]);

  // Offline eyes.
  useEffect(() => {
    const off = () => setEyes("offline");
    const on = () => setEyes("idle");
    if (!navigator.onLine) off();
    window.addEventListener("offline", off);
    window.addEventListener("online", on);
    return () => {
      window.removeEventListener("offline", off);
      window.removeEventListener("online", on);
    };
  }, []);

  const sendWall = useCallback(<E extends WallEventName>(event: E, payload: WallPayload<E>) => {
    busRef.current?.emit({ event, payload } as BusEvent);
    const ch = wallRef.current;
    if (!ch) return;
    if (ch.state === "joined") void ch.send({ type: "broadcast", event, payload });
    else void ch.httpSend(event, payload).catch(() => {});
  }, []);

  const wake = useCallback(async () => {
    // Both must start inside the tap gesture (iOS).
    const unlocked = player.unlock();
    // The mic request runs alongside: Nani wakes (and reminders play) even if the permission prompt is never answered.
    const mic = (async () => {
      try {
        if (!micRef.current) {
          micRef.current = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
          });
        }
        setMicError(null);
        setMicReady(true);
      } catch (e) {
        setMicError((e as Error).name === "NotAllowedError" ? "Microphone blocked" : "No microphone");
      }
    })();
    await unlocked;
    setAwake(true);
    await mic;
  }, [player]);

  return {
    player,
    eyes,
    setEyes,
    mode,
    setMode,
    awake,
    wake,
    micRef,
    micReady,
    micError,
    sessionIdRef,
    lastEventRef,
    clockOffsetRef,
    showTimingsRef,
    sendWall,
    onToy,
  };
}
