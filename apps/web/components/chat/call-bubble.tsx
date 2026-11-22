"use client";
// Nani's call bubble (N2): "📞 Aarav wants to show you something!" with its live state (ringing, open,
// ended: the message row updates by Realtime) and Join, which opens the call panel over the chat.
import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { callApi } from "@/lib/call/client";
import { asWho, whoLabel, type CallState } from "@/lib/call/shared";
import type { Message } from "@/lib/types";
import { CallPanel } from "./call-panel";
import { readSender, timeLabel } from "./ui";

// 50 ms of silent WAV. Played inside the Join tap, it unlocks the <audio> element the panel reuses for clips.
function silentWavUrl(): string {
  const n = 800;
  const v = new DataView(new ArrayBuffer(44 + n * 2));
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + n * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 16000, true);
  v.setUint32(28, 32000, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([v.buffer], { type: "audio/wav" }));
}

const STATE: Record<CallState, { label: string; dot: string }> = {
  ringing: { label: "Ringing…", dot: "animate-pulse bg-marigold" },
  open: { label: "On call", dot: "bg-[#3aa55d]" },
  ended: { label: "Call ended", dot: "bg-muted/40" },
};

export function CallBubble({ message }: { message: Message }) {
  const m = message.meta ?? {};
  const callId = typeof m.callId === "string" ? m.callId : null;
  const state: CallState = m.callState === "open" || m.callState === "ended" ? m.callState : "ringing";
  const who = asWho(m.who);
  const joinedBy = typeof m.joinedBy === "string" ? m.joinedBy : null;
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  const close = useCallback(() => setAudio(null), []);

  const join = () => {
    if (!callId || state === "ended") return;
    setError(null);
    // Inside the tap: unlock playback and ask for the mic once, so the first hold isn't lost to a prompt.
    const a = new Audio();
    a.setAttribute("playsinline", "");
    a.src = silentWavUrl();
    void a.play().catch(() => {});
    void navigator.mediaDevices
      ?.getUserMedia({ audio: true })
      .then((s) => s.getTracks().forEach((t) => t.stop()))
      .catch(() => {});
    setAudio(a);
    const me = readSender() || whoLabel(who);
    void callApi("join", { callId, sender: me }).then((r) => {
      if (!r.ok) {
        setAudio(null);
        setError(r.state === "ended" ? "This call has ended" : "Couldn't join. Try again");
      }
    });
  };

  const st = STATE[state];
  const text = message.text || "📞 Wants to show you something!";
  const sub = state === "open" && joinedBy ? `${st.label} with ${joinedBy}` : st.label;

  return (
    <div className="relative min-w-[15rem] rounded-[22px] rounded-tl-md border border-line bg-paper px-4 pt-3 pb-3 shadow-[0_1px_0_rgba(43,33,24,0.04)]">
      <p className="text-base leading-snug font-bold">{text}</p>
      <p className="mt-1 flex items-center gap-1.5 text-[13px] font-bold text-muted" aria-live="polite">
        <span className={`inline-block h-2 w-2 rounded-full ${st.dot}`} aria-hidden />
        {sub}
        <span className="ml-auto text-[11px] font-normal tabular-nums">{timeLabel(message.created_at)}</span>
      </p>
      {state !== "ended" && (
        <button
          type="button"
          onClick={join}
          disabled={!callId || !!audio}
          className="tg-press mt-2.5 flex w-full items-center justify-center gap-2 rounded-full bg-[#3aa55d] py-2.5 text-[16px] font-extrabold text-white disabled:opacity-50"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
            <path
              fill="currentColor"
              d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25c1.1.37 2.3.57 3.6.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1L6.6 10.8Z"
            />
          </svg>
          {audio ? "In the call" : state === "open" ? "Join the call" : "Join"}
        </button>
      )}
      {error && <p className="mt-1.5 text-[13px] font-bold text-memory">{error}</p>}
      {audio &&
        callId &&
        createPortal(
          <CallPanel callId={callId} state={state} me={readSender() || whoLabel(who)} audio={audio} onClose={close} />,
          document.body,
        )}
    </div>
  );
}
