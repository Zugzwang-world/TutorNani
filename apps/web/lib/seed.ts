// Restores the demo seed (PLAN.md Part D) for one child (server-only). Used by /api/reset.
import seed from "../../../content/seed.json";
import progressSeed from "../../../content/progress-seed.json";
import type { ProgressSeed } from "./types";
import { supabaseAdmin } from "./supabase/server";

export async function resetToSeed(child: string): Promise<{ files: number; messages: number; progressDays: number }> {
  const sb = supabaseAdmin();
  for (const t of ["turns", "messages", "agent_files"]) {
    const { error } = await sb.from(t).delete().eq("child_id", child);
    if (error) throw new Error(`reset ${t}: ${error.message}`);
  }
  const files = seed.files.map((f) => ({ ...f, child_id: child }));
  const { error: fe } = await sb.from("agent_files").insert(files);
  if (fe) throw new Error(`seed files: ${fe.message}`);
  const chat = seed.chat.map((m) => ({ ...m, child_id: child, audio_url: null }));
  const { error: me } = await sb.from("messages").insert(chat);
  if (me) throw new Error(`seed chat: ${me.message}`);
  const { error: de } = await sb
    .from("demo_state")
    .upsert({ child_id: child, clock_offset_ms: 0, show_timings: false, updated_at: new Date().toISOString() });
  if (de) throw new Error(`seed demo_state: ${de.message}`);
  const progress = await resetProgress(child);
  return { files: files.length, messages: chat.length, progressDays: progress };
}

/** Progress report history (R7.2): drops every progress day for the child, then restores content/progress-seed.json. */
async function resetProgress(child: string): Promise<number> {
  const sb = supabaseAdmin();
  const { error } = await sb.from("progress_days").delete().eq("child_id", child);
  if (error) throw new Error(`reset progress_days: ${error.message}`);
  const days = (progressSeed as ProgressSeed).days.map((d) => ({ child_id: child, day: d.day, data: d.data }));
  if (!days.length) return 0;
  const { error: pe } = await sb.from("progress_days").insert(days);
  if (pe) throw new Error(`seed progress_days: ${pe.message}`);
  return days.length;
}
