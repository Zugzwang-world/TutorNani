"use client";
// Chat data: last 100 messages, live inserts/updates, the "working" set, and sending (optimistic, deduped by clientId).
import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { CHILD_ID } from "@/lib/config";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { channelName, type BotKey, type Message } from "@/lib/types";
import { isBotKey, uid } from "./ui";

export type Row = Message & { fresh?: boolean };

export interface Pending {
  clientId: string;
  sender: string;
  kind: "text" | "voice";
  text: string; // for voice: the transcript once known
  blob?: Blob; // voice: kept for a retry of the transcription
  audioUrl?: string | null; // voice: public URL from /api/transcribe
  status: "transcribing" | "sending" | "failed";
  error?: string;
  createdAt: string;
}

const WORKING_SAFETY_MS = 30_000;

// supabase-js returns the existing channel for a topic, and postgres_changes can't be added after subscribe().
// So the chat:<child> channel is created once per page and lives as long as the page; hooks attach to it.
interface Hub {
  working: (bots: BotKey[]) => void;
  upsert: (m: Message, isInsert: boolean) => void;
  remove: (id: number) => void;
  subscribed: () => void;
}
const hubs = new Set<Hub>();
let chatChannel: RealtimeChannel | null = null;

function ensureChatChannel() {
  if (chatChannel) return;
  const filter = `child_id=eq.${CHILD_ID}`;
  chatChannel = supabaseBrowser()
    .channel(channelName.chat(CHILD_ID))
    .on("broadcast", { event: "working" }, ({ payload }) => {
      const p = (payload ?? {}) as { bots?: unknown[]; on?: boolean };
      const bots = p.on === false ? [] : (p.bots ?? []).filter(isBotKey);
      hubs.forEach((h) => h.working(bots));
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter }, (p) =>
      hubs.forEach((h) => h.upsert(p.new as Message, true)),
    )
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter }, (p) =>
      hubs.forEach((h) => h.upsert(p.new as Message, false)),
    )
    // Deletes can't be filtered; this keeps the chat right after the presenter's reset.
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, (p) => {
      const id = (p.old as Partial<Message>)?.id;
      if (id != null) hubs.forEach((h) => h.remove(id));
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") hubs.forEach((h) => h.subscribed());
    });
}

export function useChat(sender: string | null) {
  const [rows, setRows] = useState<Row[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [working, setWorking] = useState<BotKey[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [localAudio, setLocalAudio] = useState<Record<string, string>>({}); // clientId -> blob url
  const loadedRef = useRef(false);
  const workTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dropPendingFor = useCallback((list: Message[]) => {
    const ids = new Set(list.map((m) => m.meta?.clientId).filter((x): x is string => typeof x === "string"));
    if (ids.size) setPending((prev) => (prev.some((p) => ids.has(p.clientId)) ? prev.filter((p) => !ids.has(p.clientId)) : prev));
  }, []);

  /** Insert or replace one message (realtime). */
  const upsert = useCallback(
    (m: Message, isInsert: boolean) => {
      if (!m || m.child_id !== CHILD_ID) return;
      setRows((prev) => {
        const i = prev.findIndex((r) => r.id === m.id);
        if (i >= 0) {
          const next = prev.slice();
          next[i] = { ...m, fresh: prev[i].fresh };
          return next;
        }
        const next = [...prev, { ...m, fresh: loadedRef.current }];
        if (next.length > 1 && next[next.length - 2].id > m.id) next.sort((a, b) => a.id - b.id);
        return next;
      });
      dropPendingFor([m]);
      if (isInsert && m.sender_kind === "bot" && isBotKey(m.sender)) {
        setWorking((w) => (w.includes(m.sender as BotKey) ? w.filter((b) => b !== m.sender) : w));
      }
    },
    [dropPendingFor],
  );

  /** Load the last 100 and reconcile (first load, reconnects, waking from background). */
  const catchUp = useCallback(async () => {
    const { data, error } = await supabaseBrowser()
      .from("messages")
      .select("*")
      .eq("child_id", CHILD_ID)
      .order("id", { ascending: false })
      .limit(100);
    if (error || !data) return;
    const list = (data as Message[]).reverse();
    setRows((prev) => {
      if (!list.length) return [];
      const before = new Map(prev.map((r) => [r.id, r]));
      const maxId = list[list.length - 1].id;
      const next: Row[] = list.map((m) => ({ ...m, fresh: before.get(m.id)?.fresh ?? loadedRef.current }));
      for (const r of prev) if (r.id > maxId) next.push(r);
      return next;
    });
    dropPendingFor(list);
    if (!loadedRef.current) {
      loadedRef.current = true;
      setLoaded(true);
    }
  }, [dropPendingFor]);

  // Realtime: one shared channel on chat:<child> (broadcast + messages table).
  useEffect(() => {
    const h: Hub = {
      working: (bots) => {
        setWorking(bots);
        if (workTimer.current) clearTimeout(workTimer.current);
        if (bots.length) workTimer.current = setTimeout(() => setWorking([]), WORKING_SAFETY_MS);
      },
      upsert,
      remove: (id) => setRows((prev) => prev.filter((r) => r.id !== id)),
      subscribed: () => void catchUp(),
    };
    hubs.add(h);
    ensureChatChannel();

    void catchUp();
    const onVisible = () => {
      if (document.visibilityState === "visible") void catchUp();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      hubs.delete(h);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
      if (workTimer.current) clearTimeout(workTimer.current);
    };
  }, [catchUp, upsert]);

  const patch = useCallback((clientId: string, change: Partial<Pending>) => {
    setPending((prev) => prev.map((p) => (p.clientId === clientId ? { ...p, ...change } : p)));
  }, []);

  const postChat = useCallback(
    async (p: Pending) => {
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sender: p.sender,
            text: p.text,
            ...(p.audioUrl ? { audioUrl: p.audioUrl } : {}),
            clientId: p.clientId,
          }),
        });
        if (!res.ok) throw new Error(`chat ${res.status}`);
        void catchUp(); // in case a realtime event was missed
      } catch {
        // If the realtime row already arrived, the pending bubble is gone and this does nothing.
        patch(p.clientId, { status: "failed", error: "not sent" });
      }
    },
    [catchUp, patch],
  );

  const transcribeThenPost = useCallback(
    async (p: Pending) => {
      if (!p.blob) return;
      let text = "";
      let audioUrl: string | null = null;
      try {
        const type = p.blob.type || "audio/webm";
        const ext = type.includes("mp4") ? "mp4" : type.includes("ogg") ? "ogg" : type.includes("wav") ? "wav" : "webm";
        const fd = new FormData();
        fd.append("file", p.blob, `voice.${ext}`);
        const res = await fetch("/api/transcribe", { method: "POST", body: fd });
        if (!res.ok) throw new Error(`transcribe ${res.status}`);
        const j = (await res.json()) as { text?: string; audioUrl?: string | null };
        text = (j.text ?? "").trim();
        audioUrl = j.audioUrl ?? null;
      } catch {
        patch(p.clientId, { status: "failed", error: "not sent" });
        return;
      }
      if (!text) {
        patch(p.clientId, { status: "failed", error: "couldn't hear that" });
        return;
      }
      const next: Pending = { ...p, text, audioUrl, status: "sending", error: undefined };
      patch(p.clientId, { text, audioUrl, status: "sending", error: undefined });
      await postChat(next);
    },
    [patch, postChat],
  );

  /** Sends as this device's parent, or as `as` (an idea bubble always sends as its own parent). */
  const sendText = useCallback(
    (text: string, as?: string) => {
      const t = text.trim();
      const who = as ?? sender;
      if (!t || !who) return;
      const p: Pending = { clientId: uid(), sender: who, kind: "text", text: t, status: "sending", createdAt: new Date().toISOString() };
      setPending((prev) => [...prev, p]);
      void postChat(p);
    },
    [sender, postChat],
  );

  const sendVoice = useCallback(
    (blob: Blob) => {
      if (!sender) return;
      const clientId = uid();
      setLocalAudio((prev) => ({ ...prev, [clientId]: URL.createObjectURL(blob) }));
      const p: Pending = { clientId, sender, kind: "voice", text: "", blob, status: "transcribing", createdAt: new Date().toISOString() };
      setPending((prev) => [...prev, p]);
      void transcribeThenPost(p);
    },
    [sender, transcribeThenPost],
  );

  const retry = useCallback(
    (clientId: string) => {
      const p = pending.find((x) => x.clientId === clientId);
      if (!p) return;
      if (p.kind === "voice" && !p.text) {
        patch(clientId, { status: "transcribing", error: undefined });
        void transcribeThenPost(p);
      } else {
        patch(clientId, { status: "sending", error: undefined });
        void postChat(p);
      }
    },
    [pending, patch, postChat, transcribeThenPost],
  );

  return { rows, pending, working, loaded, localAudio, sendText, sendVoice, retry };
}
