"use client";
// The parent's side of a call (N2): a sheet over the chat with a big hold-to-talk button, the toy's clips
// playing as they arrive, and End. Opened from the call bubble's Join tap, which also unlocked `audio`
// (one <audio> element reused for every clip, so iPhone Safari lets it play without another tap).
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { callApi, ClipRecorder, sendClip } from "@/lib/call/client";
import { listenCall } from "@/lib/call/listen";
import { CALL_IDLE_MS, sentAtOf, type CallState } from "@/lib/call/shared";
import { config } from "@/lib/config";
import { VoicePlayer } from "./voice-player";

interface LogItem {
  key: string;
  from: "toy" | "parent";
  url: string;
}

type Hold = "idle" | "starting" | "recording" | "sending";

function mmss(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function CallPanel({
  callId,
  state,
  me,
  audio,
  onClose,
}: {
  callId: string;
  state: CallState;
  me: string;
  audio: HTMLAudioElement;
  onClose: () => void;
}) {
  const child = config.childName;
  const [log, setLog] = useState<LogItem[]>([]);
  const [hold, setHold] = useState<Hold>("idle");
  const [hearing, setHearing] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [openedAt] = useState(() => Date.now());
  const [now, setNow] = useState(openedAt);
  const ended = state === "ended";

  const rec = useRef(new ClipRecorder());
  const stream = useRef<MediaStream | null>(null);
  const holding = useRef(false);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const playingDone = useRef<(() => void) | null>(null); // settles the clip playing now (pause fires no "ended")
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const end = useCallback(
    (reason: string) => {
      if (idle.current) clearTimeout(idle.current);
      void callApi("end", { callId, reason });
      onClose();
    },
    [callId, onClose],
  );
  const endRef = useRef(end);
  useEffect(() => {
    endRef.current = end;
  }, [end]);

  const armIdle = useCallback(() => {
    if (idle.current) clearTimeout(idle.current);
    idle.current = setTimeout(() => endRef.current("idle"), CALL_IDLE_MS);
  }, []);

  // The toy's clips: play each one as it arrives, in order.
  useEffect(() => {
    armIdle();
    const recorder = rec.current;
    const off = listenCall({
      clip: (p) => {
        if (p.callId !== callId) return;
        armIdle();
        setLog((l) => [...l, { key: p.url, from: p.from, url: p.url }]);
        if (p.from !== "toy") return;
        const got = Date.now();
        queue.current = queue.current.then(async () => {
          while (holding.current) await new Promise((r) => setTimeout(r, 100)); // the parent is talking: play after
          await new Promise<void>((resolve) => {
            const done = () => {
              if (playingDone.current === done) playingDone.current = null;
              audio.onended = null;
              audio.onerror = null;
              setHearing(false);
              resolve();
            };
            playingDone.current = done;
            audio.onended = done;
            audio.onerror = done;
            audio.src = p.url;
            audio
              .play()
              .then(() => {
                setBlocked(false);
                setHearing(true);
                const sent = sentAtOf(p.url);
                console.log(
                  `[call] clip from toy played: broadcast→playing ${Date.now() - got} ms` +
                    (sent ? `, stored→playing ${Date.now() - sent} ms` : ""),
                );
              })
              .catch((e) => {
                if ((e as Error)?.name === "NotAllowedError") {
                  console.warn("[call] autoplay blocked", e);
                  setBlocked(true);
                }
                done();
              });
          });
        });
      },
    });
    return () => {
      off();
      if (idle.current) clearTimeout(idle.current);
      audio.pause();
      recorder.cancel();
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, [armIdle, audio, callId]);

  // Call clock.
  useEffect(() => {
    if (ended) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [ended]);

  // Ended from the other side (or the idle timer): show it briefly, then close.
  useEffect(() => {
    if (!ended) return;
    const t = setTimeout(onClose, 1600);
    return () => clearTimeout(t);
  }, [ended, onClose]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log]);

  const flash = (s: string) => {
    setNote(s);
    setTimeout(() => setNote((n) => (n === s ? null : n)), 2200);
  };

  // ---------- hold to talk ----------

  const stopMic = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };

  const release = async () => {
    if (!holding.current) return;
    holding.current = false;
    if (!rec.current.active) {
      // let go before the mic opened
      setHold("idle");
      return;
    }
    const r = await rec.current.stop();
    stopMic();
    if (!r) {
      setHold("idle");
      flash("Hold the button while you talk");
      return;
    }
    setHold("sending");
    armIdle();
    const sent = await sendClip(r, callId, "parent", me);
    setHold("idle");
    if (!sent) flash("Didn't send. Try again");
  };

  const press = async (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (ended || holding.current || hold === "sending") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    holding.current = true;
    audio.pause(); // talking over Aarav's clip stops it
    playingDone.current?.();
    setHearing(false);
    setHold("starting");
    try {
      navigator.vibrate?.(12);
    } catch {}
    let s: MediaStream;
    try {
      s = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      holding.current = false;
      setHold("idle");
      flash("Mic is blocked. Allow it to talk");
      return;
    }
    if (!holding.current) {
      s.getTracks().forEach((t) => t.stop());
      setHold("idle");
      flash("Hold the button while you talk");
      return;
    }
    stream.current = s;
    if (!rec.current.start(s, () => void release())) {
      stopMic();
      holding.current = false;
      setHold("idle");
      flash("Couldn't start the mic");
      return;
    }
    setHold("recording");
  };

  const status = ended
    ? "Call ended ❤️"
    : hold === "recording"
      ? `${child} will hear you…`
      : hold === "sending"
        ? "Sending…"
        : hearing
          ? `${child} is talking…`
          : state === "open"
            ? `On call · ${mmss(now - openedAt)}`
            : "Connecting…";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={`Call with ${child}`}
    >
      <div className="tg-backdrop absolute inset-0 bg-ink/40" />
      <div className="tg-sheet relative flex h-[86dvh] w-full max-w-[640px] flex-col rounded-t-[28px] bg-cream shadow-[0_-8px_40px_rgba(43,33,24,0.18)]">
        <header className="flex items-center gap-3 border-b border-line px-5 pt-5 pb-4">
          <span className="emoji flex h-12 w-12 items-center justify-center rounded-full bg-marigold-soft text-2xl">
            🧸
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-lg leading-tight font-extrabold">
              Call with {child}
            </p>
            <p
              className={`text-[14px] font-bold ${ended ? "text-muted" : "text-marigold"}`}
              aria-live="polite"
            >
              {status}
            </p>
          </div>
          <span
            className={`h-3 w-3 rounded-full ${ended ? "bg-muted/40" : hearing ? "animate-pulse bg-marigold" : "bg-[#3aa55d]"}`}
            aria-hidden
          />
        </header>

        <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3">
          {log.length === 0 ? (
            <p className="mt-6 text-center text-[15px] text-muted">
              {child} is holding the toy. Hold the button and say hello.
              <br />
              {child}&apos;s voice plays here by itself.
            </p>
          ) : (
            log.map((it) => (
              <div
                key={it.key}
                className={`mt-2 flex ${it.from === "parent" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`rounded-[20px] px-3 py-1.5 ${
                    it.from === "parent"
                      ? "border border-marigold/25 bg-marigold-soft"
                      : "border border-line bg-paper"
                  }`}
                >
                  <p className="text-[12px] font-extrabold text-muted">
                    {it.from === "parent" ? "You" : child}
                  </p>
                  <VoicePlayer src={it.url} mine={it.from === "parent"} />
                </div>
              </div>
            ))
          )}
          {blocked && (
            <p className="mt-3 text-center text-[13px] text-muted">
              Tap ▶ to hear {child} (the browser blocked autoplay)
            </p>
          )}
        </div>

        <div className="flex flex-col items-center gap-3 border-t border-line px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <p className="min-h-5 text-[13px] font-bold text-muted">
            {note ?? (ended ? "" : "Hold to talk, let go to send")}
          </p>
          <button
            type="button"
            disabled={ended}
            aria-label={`Hold to talk to ${child}`}
            onPointerDown={press}
            onPointerUp={() => void release()}
            onPointerCancel={() => void release()}
            onContextMenu={(e) => e.preventDefault()}
            className={`tg-mic flex h-32 w-32 items-center justify-center rounded-full text-white shadow-lg transition-transform duration-150 select-none disabled:opacity-40 ${
              hold === "recording"
                ? "scale-110 bg-[#d64545]"
                : hold === "starting"
                  ? "scale-105 bg-marigold/80"
                  : "bg-marigold"
            }`}
          >
            <svg viewBox="0 0 24 24" className="h-12 w-12" aria-hidden>
              <rect
                x="8.5"
                y="2.5"
                width="7"
                height="12"
                rx="3.5"
                fill="currentColor"
              />
              <path
                d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => (ended ? onClose() : end("tap"))}
            className="tg-press mt-1 w-full max-w-xs rounded-full bg-[#d64545] py-3 text-base font-extrabold text-white"
          >
            {ended ? "Close" : "End call"}
          </button>
        </div>
      </div>
    </div>
  );
}
