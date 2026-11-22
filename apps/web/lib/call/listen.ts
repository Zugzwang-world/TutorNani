// The parent's side listens to toy:<child> `call` and `clip` broadcasts. It uses its own Supabase client
// (like app/toy/use-routine.ts): supabase-js hands back the same channel object for the same topic, and a
// strict-mode remount would otherwise try to add listeners to an already-subscribed channel.
import { createClient } from "@supabase/supabase-js";
import { CHILD_ID } from "@/lib/config";
import { channelName, type ToyEvent } from "@/lib/types";

type Payload<E extends ToyEvent["event"]> = Extract<ToyEvent, { event: E }>["payload"];

export function listenCall(on: { call?: (p: Payload<"call">) => void; clip?: (p: Payload<"clip">) => void }): () => void {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const ch = sb
    .channel(channelName.toy(CHILD_ID))
    .on("broadcast", { event: "call" }, ({ payload }) => on.call?.(payload as Payload<"call">))
    .on("broadcast", { event: "clip" }, ({ payload }) => on.clip?.(payload as Payload<"clip">))
    .subscribe();
  return () => {
    void sb.removeChannel(ch);
    void sb.realtime.disconnect();
  };
}
