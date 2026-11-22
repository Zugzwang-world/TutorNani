// In-page wall feed (REFINE R1). On /stage the toy core and the wall share one page: supabase-js would hand
// both the same wall:<child> channel object, and a page never hears its own broadcasts. So the stage's toy
// core emits wall events on this bus (and still broadcasts, for a projector on /home-base), and the stage's
// <Wall bus={…}> listens here instead of on the channel. Pure; client-safe.
import type { Cue, TurnTimings } from "./types";

export type WallEvent =
  | { event: "cue"; payload: { cue: Cue; turnId?: string } }
  | { event: "thinking"; payload: { on: boolean } }
  | { event: "speaking"; payload: { on: boolean } }
  | { event: "timings"; payload: { show?: boolean; ms?: TurnTimings } }
  | { event: "reset"; payload?: Record<string, never> };

export interface WallBus {
  emit(e: WallEvent): void;
  subscribe(fn: (e: WallEvent) => void): () => void;
}

export function createWallBus(): WallBus {
  const subs = new Set<(e: WallEvent) => void>();
  return {
    emit: (e) => subs.forEach((fn) => fn(e)),
    subscribe: (fn) => {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}
