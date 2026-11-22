// Server-side Realtime broadcast over REST (PLAN.md B9). Topics: channelName.toy/wall/chat in types.ts.
export async function broadcast(topic: string, event: string, payload: unknown): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Supabase env missing");
  const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ topic, event, payload }] }),
  });
  if (!res.ok) throw new Error(`broadcast ${topic}/${event}: ${res.status} ${await res.text()}`);
}

/** Same as broadcast, but never throws (for best-effort UI signals). */
export async function broadcastSafe(topic: string, event: string, payload: unknown): Promise<void> {
  try {
    await broadcast(topic, event, payload);
  } catch (e) {
    console.error((e as Error).message);
  }
}
