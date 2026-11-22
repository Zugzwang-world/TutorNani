"use client";
// ▶ under Nani's messages: POST /api/say {text} -> {url}, then play it. Quiet failure if the voice isn't ready.
import { useEffect, useRef, useState } from "react";

const cache = new Map<string, string>(); // text -> url, for this visit
let current: HTMLAudioElement | null = null; // one Nani line at a time
const SILENT = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";

type State = "idle" | "loading" | "playing" | "failed";

export function SayButton({ text }: { text: string }) {
  const [state, setState] = useState<State>("idle");
  const audio = useRef<HTMLAudioElement | null>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      audio.current?.pause();
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  const fail = () => {
    setState("failed");
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setState("idle"), 2500);
  };

  const onClick = async () => {
    if (state === "playing") {
      audio.current?.pause();
      setState("idle");
      return;
    }
    if (state === "loading") return;
    setState("loading");
    // iPhone Safari only plays audio started inside the tap: create and unlock the element now, set the real src after the fetch.
    current?.pause();
    const a = new Audio(SILENT);
    a.play().catch(() => {});
    audio.current = a;
    current = a;
    try {
      let url = cache.get(text);
      if (!url) {
        const res = await fetch("/api/say", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (!res.ok) throw new Error(`say ${res.status}`);
        const j = (await res.json()) as { url?: string };
        if (!j.url) throw new Error("no url");
        url = j.url;
        cache.set(text, url);
      }
      a.pause();
      a.src = url;
      a.onended = () => setState("idle");
      a.onpause = () => setState((s) => (s === "playing" ? "idle" : s));
      a.onerror = fail;
      await a.play();
      setState("playing");
    } catch {
      fail();
    }
  };

  const label =
    state === "loading" ? "Getting Nani's voice…" : state === "playing" ? "Stop" : state === "failed" ? "Voice not ready yet" : "Hear Nani";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={state === "playing" ? "Stop Nani's voice" : "Hear this in Nani's voice"}
      className={`tg-press mt-2 inline-flex items-center gap-1.5 rounded-full py-1 pr-3 pl-1 text-[13px] font-bold transition-colors ${
        state === "failed" ? "bg-line/70 text-muted" : "bg-marigold-soft text-[#a65f00]"
      }`}
    >
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-full text-white ${state === "failed" ? "bg-muted/60" : "bg-marigold"}`}
      >
        {state === "loading" ? (
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
        ) : state === "playing" ? (
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
            <rect x="1.5" y="1.5" width="7" height="7" rx="1.2" fill="currentColor" />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
            <path d="M2.5 1.2v7.6a.6.6 0 0 0 .9.5l6-3.8a.6.6 0 0 0 0-1L3.4.7a.6.6 0 0 0-.9.5Z" fill="currentColor" />
          </svg>
        )}
      </span>
      {label}
    </button>
  );
}
