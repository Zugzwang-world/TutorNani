"use client";
// The projector wall (PLAN C4). Listens on wall:<child>, shows one cue at a time, plays no audio.
import "./wall.css";
import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { CHILD_ID } from "@/lib/config";
import { clockParts } from "@/lib/clock";
import { parseMarkers } from "@/lib/markers";
import { channelName, type Cue, type TurnTimings } from "@/lib/types";
import type { WallBus } from "@/lib/wall-bus";
import {
  CallScene,
  CheerScene,
  ChoicesScene,
  CountScene,
  IdleScene,
  LetterScene,
  ShowScene,
  SongScene,
  SoundScene,
  SpellScene,
  ThinkingScene,
  type SpellBoard,
} from "./scenes";

type BaseCue = Exclude<Cue, { type: "spell" } | { type: "tile" } | { type: "sound" }>;

type View =
  | { kind: "idle"; key: number }
  | { kind: "cue"; key: number; cue: BaseCue }
  | { kind: "spell"; key: number; board: SpellBoard }
  | { kind: "letter"; key: number; letter: string; result: "right" | "wrong" };

interface WallState {
  view: View; // what stays on the wall
  flash: { key: number; name: string } | null; // a brief animal over the view
  thinking: boolean;
  speaking: boolean;
  n: number; // counter for animation keys
}

type Action =
  | { t: "cue"; cue: Cue }
  | { t: "thinking"; on: boolean }
  | { t: "speaking"; on: boolean }
  | { t: "idle" }
  | { t: "flashDone"; key: number };

const initial: WallState = { view: { kind: "idle", key: 0 }, flash: null, thinking: false, speaking: false, n: 0 };

function reduce(s: WallState, a: Action): WallState {
  switch (a.t) {
    case "thinking":
      return { ...s, thinking: a.on, flash: a.on ? null : s.flash };
    case "speaking":
      return { ...s, speaking: a.on };
    case "idle":
      return { ...s, thinking: false, flash: null, n: s.n + 1, view: { kind: "idle", key: s.n + 1 } };
    case "flashDone":
      return s.flash?.key === a.key ? { ...s, flash: null } : s;
    case "cue": {
      const c = a.cue;
      const n = s.n + 1;
      const next = { ...s, thinking: false, n };
      switch (c.type) {
        case "sound":
          return { ...next, flash: { key: n, name: c.name } };
        case "spell":
          return {
            ...next,
            flash: null,
            view: {
              kind: "spell",
              key: n,
              board: {
                word: c.word,
                gap: c.gap,
                tiles: c.tiles.slice(0, 3).map((letter) => ({ letter, state: "idle" as const })),
                filled: false,
              },
            },
          };
        case "tile": {
          if (s.view.kind === "spell") {
            const b = s.view.board;
            const idx = b.tiles.findIndex((t) => t.letter === c.letter && t.state === "idle");
            const tiles = b.tiles.map((t, i) => (i === idx ? { ...t, state: c.result } : t));
            // Same key: the board stays mounted, so the tile animates in place.
            return { ...next, flash: null, view: { ...s.view, board: { ...b, tiles, filled: b.filled || c.result === "right" } } };
          }
          return { ...next, flash: null, view: { kind: "letter", key: n, letter: c.letter, result: c.result } };
        }
        default:
          return { ...next, flash: null, view: { kind: "cue", key: n, cue: c } };
      }
    }
  }
}

// ?demo=1 cycles through every cue type (C4 examples), 3 s each.
const DEMO_STEPS: (string | "idle" | "thinking")[] = [
  "idle",
  "thinking",
  "[[show 🥭 Mango]]",
  "[[spell MANGO 1 M S T]]",
  "[[tile S wrong]]",
  "[[tile M right]]",
  "[[show 🌙 Moon | chand | ⭐]]",
  "[[show 🐒 Monkey | bandar | 🍌 🌳]]",
  "[[count 🥭 3 both]]",
  "[[count ⭐ 5+3 both]]",
  "[[count 🥭 1+1]]",
  "[[choices 🎵 Song, 🔤 Letters, 🔢 Count, 🦁 Animals]]",
  "[[cheer 🥭]]",
  "[[sound lion]]",
  "[[song]]",
  "[[call mumma]]",
];

const IDLE_AFTER_MS = 120_000;
const MIN_VIEW_MS = 1400; // a tile's fly and landing take ~1.4 s
const SOUND_MS = 2500;
const STRIP_MAX = 12;
const stickerKey = () => `wall:stickers:${clockParts(new Date()).dateKey}`;

function loadStickers(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(stickerKey()) || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function hasTimings(t: unknown): t is TurnTimings {
  return !!t && typeof t === "object" && Object.values(t as object).some((v) => typeof v === "number");
}

// Keeps the scene that is leaving on the wall for a moment, fading out while the new one fades in,
// so the wall is never blank between cues. Scenes are keyed, so a leaving scene keeps its DOM
// (its animations do not restart).
const EXIT_MS = 300;

function Stage({ k, children }: { k: string; children: ReactNode }) {
  const last = useRef<{ key: string; node: ReactNode }>({ key: k, node: children });
  const [prevKey, setPrevKey] = useState(k);
  const [leaving, setLeaving] = useState<{ key: string; node: ReactNode } | null>(null);
  if (prevKey !== k) {
    setPrevKey(k);
    setLeaving(last.current);
  }
  useEffect(() => {
    last.current = { key: k, node: children };
  });
  useEffect(() => {
    if (!leaving) return;
    const id = setTimeout(() => setLeaving(null), EXIT_MS);
    return () => clearTimeout(id);
  }, [leaving]);
  return (
    <>
      {leaving && leaving.key !== k && (
        <div key={leaving.key} className="wall-layer wall-leaving" aria-hidden>
          {leaving.node}
        </div>
      )}
      <div key={k} className="wall-layer">
        {children}
      </div>
    </>
  );
}

/**
 * `bus`: on /stage, wall events come from the page's own toy core instead of the wall:<child> channel.
 * `contained`: fill the parent (position: relative) instead of the window, sized by container units.
 */
export default function Wall({ bus, contained = false }: { bus?: WallBus; contained?: boolean } = {}) {
  const [s, dispatch] = useReducer(reduce, initial);
  const [stickers, setStickers] = useState<string[]>([]);
  const [newest, setNewest] = useState(-1);
  const [showTimings, setShowTimings] = useState(false);
  const [timings, setTimings] = useState<TurnTimings | null>(null);
  const [live, setLive] = useState(false);
  const [tapped, setTapped] = useState(false);
  const demoRef = useRef(false);
  const rootRef = useRef<HTMLElement>(null);
  const stickersRef = useRef<string[]>([]);

  const applyCue = useCallback((cue: Cue) => {
    if (cue.type === "cheer") {
      const next = [...stickersRef.current, cue.emoji];
      stickersRef.current = next;
      setStickers(next);
      setNewest(next.length - 1);
      if (!demoRef.current) {
        try {
          localStorage.setItem(stickerKey(), JSON.stringify(next));
        } catch {}
      }
    }
    dispatch({ t: "cue", cue });
  }, []);

  // Cues of one sentence arrive together. Each view gets at least MIN_VIEW_MS on the wall before the next
  // replaces it, so the moon card is seen before its spelling board, and the tile lands before the cheer.
  const freeAt = useRef(0);
  const pending = useRef<{ timer: ReturnType<typeof setTimeout>; cue: Cue }[]>([]);
  const onCue = useCallback(
    (cue: Cue) => {
      if (cue.type === "sound" || demoRef.current) return applyCue(cue);
      const now = performance.now();
      const at = Math.max(now, freeAt.current);
      freeAt.current = at + MIN_VIEW_MS;
      if (at <= now) return applyCue(cue);
      const entry = {
        cue,
        timer: setTimeout(() => {
          pending.current = pending.current.filter((p) => p !== entry);
          applyCue(cue);
        }, at - now),
      };
      pending.current.push(entry);
    },
    [applyCue],
  );
  // A new turn starting (thinking) shows every held cue at once, in order, then the thinking scene.
  const flushCues = useCallback(() => {
    const held = pending.current;
    pending.current = [];
    freeAt.current = 0;
    for (const p of held) {
      clearTimeout(p.timer);
      applyCue(p.cue);
    }
  }, [applyCue]);
  useEffect(() => {
    const held = pending;
    return () => held.current.forEach((p) => clearTimeout(p.timer));
  }, []);

  // The new sticker flies from the middle of the stage down into its place in the strip.
  useLayoutEffect(() => {
    const root = rootRef.current;
    const el = root?.querySelector<HTMLElement>(".wall-sticker-new");
    const stage = root?.querySelector<HTMLElement>(".wall-stage");
    const strip = el?.offsetParent as HTMLElement | null;
    if (!root || !el || !stage || !strip) return;
    const x = el.offsetLeft + el.offsetWidth / 2;
    const y = strip.offsetTop + el.offsetTop + el.offsetHeight / 2;
    el.style.setProperty("--fx", `${root.clientWidth / 2 - x}px`);
    el.style.setProperty("--fy", `${stage.offsetHeight / 2 - y}px`);
  }, [newest]);

  // Today's stickers, and demo mode.
  useEffect(() => {
    const demo = new URLSearchParams(location.search).get("demo") === "1";
    demoRef.current = demo;
    if (!demo) {
      const saved = loadStickers();
      stickersRef.current = saved;
      setStickers(saved);
    }
    if (!demo) return;
    let i = 0;
    const step = () => {
      const st = DEMO_STEPS[i % DEMO_STEPS.length];
      if (st === "idle") dispatch({ t: "idle" });
      else if (st === "thinking") dispatch({ t: "thinking", on: true });
      else parseMarkers(st).cues.forEach(onCue);
      i++;
    };
    step();
    const id = setInterval(step, 3000);
    return () => clearInterval(id);
  }, [onCue]);

  // Live: broadcast events on wall:<child>, or the stage's in-page bus.
  useEffect(() => {
    const handle = (event: string, payload: { cue?: Cue; on?: boolean; show?: boolean; ms?: unknown } | undefined) => {
      if (event === "cue") {
        if (payload?.cue?.type) onCue(payload.cue);
      } else if (event === "thinking") {
        if (payload?.on) flushCues();
        dispatch({ t: "thinking", on: !!payload?.on });
      }
      else if (event === "speaking") dispatch({ t: "speaking", on: !!payload?.on });
      else if (event === "timings") {
        if (typeof payload?.show === "boolean") setShowTimings(payload.show);
        if (hasTimings(payload?.ms)) setTimings(payload.ms);
      } else if (event === "reset") {
        try {
          localStorage.removeItem(stickerKey());
        } catch {}
        location.reload();
      }
    };
    if (bus) {
      return bus.subscribe((e) => handle(e.event, e.payload as Parameters<typeof handle>[1]));
    }
    const sb = supabaseBrowser();
    let ch = sb.channel(channelName.wall(CHILD_ID));
    for (const ev of ["cue", "thinking", "speaking", "timings", "reset"]) {
      ch = ch.on("broadcast", { event: ev }, ({ payload }) => handle(ev, payload));
    }
    ch.subscribe((status) => setLive(status === "SUBSCRIBED"));
    return () => {
      sb.removeChannel(ch);
    };
  }, [onCue, flushCues, bus]);

  // Live: demo_state.show_timings and the latest turn's timings.
  useEffect(() => {
    const sb = supabaseBrowser();
    const filter = `child_id=eq.${CHILD_ID}`;
    sb.from("demo_state")
      .select("show_timings")
      .eq("child_id", CHILD_ID)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setShowTimings(!!data.show_timings);
      });
    sb.from("turns")
      .select("timings")
      .eq("child_id", CHILD_ID)
      .order("id", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        const row = data?.find((r) => hasTimings(r.timings));
        if (row) setTimings((cur) => cur ?? row.timings);
      });
    const ch = sb
      .channel(`wall-db:${CHILD_ID}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "demo_state", filter }, (p) => {
        const row = p.new as { show_timings?: boolean };
        if (typeof row?.show_timings === "boolean") setShowTimings(row.show_timings);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "turns", filter }, (p) => {
        const t = (p.new as { timings?: unknown }).timings;
        if (hasTimings(t)) setTimings(t);
      })
      .subscribe();
    return () => {
      sb.removeChannel(ch);
    };
  }, []);

  // The animal shows briefly, then the wall goes back to what it was showing.
  useEffect(() => {
    if (!s.flash) return;
    const key = s.flash.key;
    const id = setTimeout(() => dispatch({ t: "flashDone", key }), SOUND_MS);
    return () => clearTimeout(id);
  }, [s.flash]);

  // After a long quiet spell, go back to the calm scene.
  useEffect(() => {
    if (s.view.kind === "idle" || s.thinking || demoRef.current) return;
    const id = setTimeout(() => dispatch({ t: "idle" }), IDLE_AFTER_MS);
    return () => clearTimeout(id);
  }, [s.view, s.thinking]);

  // First tap: fullscreen and keep the screen awake (kiosk on the projector's browser).
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    let wanted = false;
    const getLock = async () => {
      try {
        const wl = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock;
        if (wl && document.visibilityState === "visible") lock = await wl.request("screen");
      } catch {}
    };
    const onTap = () => {
      setTapped(true);
      try {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
      } catch {}
      if (!wanted || !lock) {
        wanted = true;
        getLock();
      }
    };
    const onVis = () => {
      if (wanted && document.visibilityState === "visible") getLock();
    };
    window.addEventListener("pointerdown", onTap);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pointerdown", onTap);
      document.removeEventListener("visibilitychange", onVis);
      lock?.release().catch(() => {});
    };
  }, []);

  const v = s.view;
  let scene: ReactNode;
  let sceneKey: string;
  if (s.thinking) {
    scene = <ThinkingScene />;
    sceneKey = "thinking";
  } else if (s.flash) {
    scene = <SoundScene name={s.flash.name} />;
    sceneKey = `sound-${s.flash.key}`;
  } else {
    sceneKey = `v-${v.key}`;
    if (v.kind === "idle") scene = <IdleScene />;
    else if (v.kind === "spell") scene = <SpellScene board={v.board} />;
    else if (v.kind === "letter") scene = <LetterScene letter={v.letter} result={v.result} />;
    else {
      const c = v.cue;
      if (c.type === "show") scene = <ShowScene emoji={c.emoji} word={c.word} hindi={c.hindi} extras={c.extras} />;
      else if (c.type === "count") scene = <CountScene cue={c} />;
      else if (c.type === "choices") scene = <ChoicesScene items={c.items} />;
      else if (c.type === "cheer") scene = <CheerScene emoji={c.emoji} />;
      else if (c.type === "song") scene = <SongScene />;
      else scene = <CallScene who={c.who} />;
    }
  }

  const shown = stickers.slice(-STRIP_MAX);
  const offset = stickers.length - shown.length;

  return (
    <main className={`wall-root${contained ? " wall-contained" : ""}`} data-scene={sceneKey} ref={rootRef}>
      <div className="wall-stage">
        <Stage k={sceneKey}>{scene}</Stage>
      </div>

      {s.speaking && (
        <div className="wall-speaking" aria-hidden>
          <span className="emoji">👵</span>
          <span className="wall-bars">
            <i />
            <i />
            <i />
          </span>
        </div>
      )}

      {showTimings && (
        <div className="wall-timings">
          {(["stt", "brainFirst", "voiceFirst", "total"] as const).map((k) => (
            <div key={k}>
              <span>{k}</span>
              <b>{typeof timings?.[k] === "number" ? Math.round(timings[k]!) : "–"}</b>
            </div>
          ))}
          <small>ms</small>
        </div>
      )}

      <div className="wall-strip">
        {shown.length === 0 ? (
          <span className="wall-strip-empty">Today&apos;s stickers</span>
        ) : (
          shown.map((e, i) => (
            <span key={offset + i} className={`emoji wall-sticker ${offset + i === newest ? "wall-sticker-new" : ""}`}>
              {e}
            </span>
          ))
        )}
      </div>

      <span className={`wall-live ${bus || live ? "on" : ""}`} title={bus || live ? "Connected" : "Connecting"} />
      {!tapped && <p className="wall-hint">Tap for full screen</p>}
    </main>
  );
}
