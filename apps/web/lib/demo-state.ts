// Presenter state: demo clock offset and the wall timings switch (server-only).
import { supabaseAdmin } from "./supabase/server";
import type { DemoState } from "./types";

export async function getDemoState(child: string): Promise<DemoState> {
  const { data, error } = await supabaseAdmin().from("demo_state").select("*").eq("child_id", child).maybeSingle();
  if (error) throw new Error(`demo-state.get: ${error.message}`);
  return (data as DemoState) ?? { child_id: child, clock_offset_ms: 0, show_timings: false, updated_at: new Date(0).toISOString() };
}

export async function setDemoState(child: string, patch: Partial<Pick<DemoState, "clock_offset_ms" | "show_timings">>): Promise<DemoState> {
  const { data, error } = await supabaseAdmin()
    .from("demo_state")
    .upsert({ child_id: child, ...patch, updated_at: new Date().toISOString() })
    .select()
    .single();
  if (error) throw new Error(`demo-state.set: ${error.message}`);
  return data as DemoState;
}
