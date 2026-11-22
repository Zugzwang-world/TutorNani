// Reads content/demo.config.json (repo root). All demo content comes from there.
import raw from "../../../content/demo.config.json";
import type { Bubble } from "./types";

export type DemoConfig = typeof raw;
export const config: DemoConfig = raw;
export const CHILD_ID: string = raw.childId;
/** Idea bubbles (R2.4). The phone's "Try saying" chip row uses the same lines. */
export const BUBBLES: Bubble[] = raw.bubbles as Bubble[];

export type BrainProvider = "kimi" | "anthropic";

/** One provider's settings; by default the committed `brain.provider`. The live choice (BRAIN_PROVIDER env wins)
 * is brainProvider() in lib/brain.ts, server-only. */
export function brainSettings(provider: BrainProvider = raw.brain.provider as BrainProvider) {
  const p = raw.brain.providers[provider] as {
    baseUrl?: string;
    model: string;
    keyEnv: string;
    thinking: string;
    effort?: string;
  };
  return { provider, ...p };
}
