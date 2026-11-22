"use client";
// Live data for one agent's profile: every version of its file, and recent chat to find real examples.
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";
import { CHILD_ID } from "@/lib/config";
import { diffLines, removedLines } from "@/lib/files-pure";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { BOTS, type AgentFile, type BotKey, type Message } from "@/lib/types";

// One Realtime channel per agent, topic `profile:<bot>`. supabase-js hands back the same channel for the same topic,
// and a channel can't take new listeners once it has joined, so we keep one per bot and tear it down a little late
// (a quick close and reopen, or React's double mount, reuses it).
type Change = { type: "INSERT" | "UPDATE" | "DELETE"; row: Partial<AgentFile> };
interface Entry {
  ch: RealtimeChannel;
  listeners: Set<(c: Change) => void>;
  timer: ReturnType<typeof setTimeout> | null;
}
const entries = new Map<BotKey, Entry>();

function listen(bot: BotKey, cb: (c: Change) => void): () => void {
  let e = entries.get(bot);
  if (!e) {
    const listeners = new Set<(c: Change) => void>();
    const ch = supabaseBrowser()
      .channel(`profile:${bot}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "agent_files", filter: `child_id=eq.${CHILD_ID}` }, (p) => {
        const change: Change = { type: p.eventType as Change["type"], row: (p.eventType === "DELETE" ? p.old : p.new) as Partial<AgentFile> };
        listeners.forEach((f) => f(change));
      })
      .subscribe();
    e = { ch, listeners, timer: null };
    entries.set(bot, e);
  }
  if (e.timer) {
    clearTimeout(e.timer);
    e.timer = null;
  }
  e.listeners.add(cb);
  const entry = e;
  return () => {
    entry.listeners.delete(cb);
    if (entry.listeners.size === 0) {
      entry.timer = setTimeout(() => {
        if (entry.listeners.size === 0 && entries.get(bot) === entry) {
          entries.delete(bot);
          void supabaseBrowser().removeChannel(entry.ch);
        }
      }, 5000);
    }
  };
}

type ChatRow = Pick<Message, "id" | "sender" | "sender_kind" | "text" | "meta" | "created_at">;

export interface ProfileData {
  versions: AgentFile[] | null;
  messages: ChatRow[];
  failed: boolean;
}

export function useProfileData(bot: BotKey): ProfileData {
  const file = BOTS[bot].file;
  const [versions, setVersions] = useState<AgentFile[] | null>(null);
  const [messages, setMessages] = useState<ChatRow[]>([]);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0); // bump to refetch

  useEffect(() => {
    let alive = true;
    const sb = supabaseBrowser();
    sb.from("agent_files")
      .select("*")
      .eq("child_id", CHILD_ID)
      .eq("name", file)
      .order("version", { ascending: true })
      .then(({ data, error }) => {
        if (!alive) return;
        if (error || !data) setFailed(true);
        else {
          setFailed(false);
          setVersions(data as AgentFile[]);
        }
      });
    sb.from("messages")
      .select("id,sender,sender_kind,text,meta,created_at")
      .eq("child_id", CHILD_ID)
      .order("id", { ascending: false })
      .limit(120)
      .then(({ data }) => {
        if (alive && data) setMessages((data as ChatRow[]).reverse());
      });
    return () => {
      alive = false;
    };
  }, [file, tick]);

  // Live: a new version of this file appears right away; anything else (a reset) refetches.
  useEffect(() => {
    return listen(bot, (c) => {
      if (c.type === "INSERT") {
        const row = c.row as AgentFile;
        if (row.name !== file) return;
        setVersions((prev) => [...(prev ?? []).filter((v) => v.id !== row.id), row].sort((a, b) => a.version - b.version));
        setTimeout(() => setTick((n) => n + 1), 1800); // the reply that explains it lands a moment later
      } else if (c.type === "DELETE" || !c.row.name || c.row.name === file) {
        setTick((n) => n + 1);
      }
    });
  }, [bot, file]);

  return { versions, messages, failed };
}

// ---------- examples (real lines first, then the seeded ones) ----------

export interface Example {
  who: string;
  before: string;
  after: string;
  real: boolean; // from this chat's real versions, not the written seeds
}

/** Before → after cards from the file's real versions: what the parent said, and the line it became. */
export function realExamples(versions: AgentFile[], messages: ChatRow[]): Example[] {
  const out: Example[] = [];
  for (let i = versions.length - 1; i >= 1; i--) {
    const v = versions[i];
    const prev = versions[i - 1];
    const added = diffLines(prev.content, v.content);
    const removed = removedLines(prev.content, v.content);
    if (!added.length && !removed.length) continue;
    const botMsg = messages.find((m) => m.sender_kind === "bot" && m.meta?.file === v.name && m.meta?.toVersion === v.version);
    let before = "";
    let who = "A parent";
    if (botMsg) {
      for (let k = messages.length - 1; k >= 0; k--) {
        const m = messages[k];
        if (m.id < botMsg.id && m.sender_kind === "parent") {
          before = m.text;
          who = m.sender;
          break;
        }
      }
    }
    if (!before && v.change_note) {
      const m = v.change_note.match(/^([^:]{1,20}):\s*(.+)$/);
      who = m ? m[1] : "A parent";
      before = m ? m[2] : v.change_note;
    }
    if (!before) before = removed.length ? "Stop one of the lines" : "A new instruction";
    const after = added.length ? added.join("\n") : `Removed: ${removed.join("; ")}`;
    out.push({ who, before: before.length > 140 ? before.slice(0, 137) + "…" : before, after, real: true });
    if (out.length >= 3) break;
  }
  return out;
}
