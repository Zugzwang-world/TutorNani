import { brainComplete } from "@/lib/brain";
import { broadcastSafe } from "@/lib/broadcast";
import { CHILD_ID } from "@/lib/config";
import { tts } from "@/lib/eleven";
import { resetToSeed } from "@/lib/seed";
import { supabaseAdmin } from "@/lib/supabase/server";
import { channelName } from "@/lib/types";

/** Times one warm-up call; a failure or a timeout is reported, never thrown. */
async function timed(name: string, f: (signal: AbortSignal) => Promise<unknown>, ms = 8000): Promise<[string, number | string]> {
  const t0 = Date.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    await f(ac.signal);
    return [name, Date.now() - t0];
  } catch (e) {
    return [name, `failed: ${(e as Error).message.slice(0, 80)}`];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * R8.2 warm-up: one tiny brain call, one tiny voice call and one Supabase read, so the first real answer
 * isn't the slowest. One brain request only (Kimi throttles bursts); the three run side by side.
 */
async function warmUp(): Promise<Record<string, number | string>> {
  const r = await Promise.all([
    timed("brainMs", (signal) => brainComplete({ messages: [{ role: "user", content: "Say ok." }], maxTokens: 1, signal, label: "warm-up" })),
    timed("voiceMs", (signal) => tts("Haan.", { signal })),
    timed("dbMs", async () => {
      const { error } = await supabaseAdmin().from("agent_files").select("id").eq("child_id", CHILD_ID).limit(1);
      if (error) throw new Error(error.message);
    }),
  ]);
  return Object.fromEntries(r);
}

// Restores the seed (files at seed versions, seed chat, no turns, progress history, clock at real time),
// warms up the brain, the voice and the database, then tells /toy, /stage and /home-base to reload.
// The warm-up comes first so a page that reloads on the broadcast never kills the caller's fetch early.
// `?warm=0` skips the warm-up. `ready: true` means the stage can show "Ready" (after its reload).
export async function POST(req: Request) {
  const r = await resetToSeed(CHILD_ID);
  const warm = new URL(req.url).searchParams.get("warm") === "0" ? null : await warmUp();
  await Promise.all([
    broadcastSafe(channelName.toy(CHILD_ID), "reset", {}),
    broadcastSafe(channelName.wall(CHILD_ID), "reset", {}),
  ]);
  return Response.json({ ok: true, ready: true, ...r, warm });
}
