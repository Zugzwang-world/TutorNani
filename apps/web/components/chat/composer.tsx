"use client";
// Sticky input: "Try saying…" chips (phones only; wide containers get idea bubbles), a growing text box, and a hold-to-record mic (slide off to cancel).
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { BUBBLES } from "@/lib/config";

type RecState = "idle" | "starting" | "recording";

interface Rec {
  id: number;
  stream?: MediaStream;
  mr?: MediaRecorder;
  chunks: Blob[];
  startedAt: number;
  released: boolean;
  cancelled: boolean;
  zone: { left: number; top: number; right: number; bottom: number };
}

const MIN_MS = 600; // shorter than this is a tap, not a voice note
const SLIDE = 56; // px outside the mic before release cancels

function pickMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", "audio/ogg"]) {
    try {
      if (MediaRecorder.isTypeSupported(t)) return t;
    } catch {
      /* ignore */
    }
  }
  return undefined;
}

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(since);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.floor((now - since) / 1000));
  return (
    <span className="tabular-nums">
      {Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}
    </span>
  );
}

const LEVEL_BARS = 22;

/**
 * Live mic level: a short scrolling waveform, plus a --lvl CSS variable on `halo` (the mic button) for its glow.
 * Written straight to the DOM each frame, so recording never re-renders the composer.
 */
function LiveLevel({ stream, halo }: { stream: MediaStream; halo: RefObject<HTMLElement | null> }) {
  const box = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    const Ctx: typeof AudioContext | undefined =
      typeof window !== "undefined" ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
    const glow = halo.current;
    if (!Ctx) return;
    let ctx: AudioContext;
    try {
      ctx = new Ctx();
    } catch {
      return;
    }
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser();
    an.fftSize = 512;
    src.connect(an);
    const buf = new Uint8Array(an.fftSize);
    const hist: number[] = Array(LEVEL_BARS).fill(0);
    let raf = 0;
    let last = 0;
    let smooth = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      an.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      const lvl = Math.min(1, Math.sqrt(sum / buf.length) * 4.5);
      smooth = smooth * 0.7 + lvl * 0.3;
      glow?.style.setProperty("--lvl", smooth.toFixed(3));
      if (now - last < 75) return;
      last = now;
      hist.shift();
      hist.push(smooth);
      const bars = box.current?.children;
      if (!bars) return;
      for (let i = 0; i < bars.length; i++) (bars[i] as HTMLElement).style.transform = `scaleY(${Math.max(0.14, hist[i]).toFixed(3)})`;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      glow?.style.removeProperty("--lvl");
      try {
        src.disconnect();
      } catch {
        /* ignore */
      }
      void ctx.close().catch(() => {});
    };
  }, [stream, halo]);
  return (
    <span ref={box} className="tg-level min-w-0 flex-1 justify-center overflow-hidden text-[#e5484d]/80" aria-hidden>
      {Array.from({ length: LEVEL_BARS }, (_, i) => (
        <span key={i} />
      ))}
    </span>
  );
}

export function Composer({
  disabled,
  onSendText,
  onSendVoice,
  onSent,
}: {
  disabled: boolean;
  onSendText: (text: string) => void;
  onSendVoice: (blob: Blob) => void;
  onSent: () => void;
}) {
  const [text, setText] = useState("");
  const [rec, setRec] = useState<RecState>("idle");
  const [armed, setArmed] = useState(false); // release now cancels
  const [startedAt, setStartedAt] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const micBtn = useRef<HTMLButtonElement | null>(null);
  const box = useRef<HTMLTextAreaElement | null>(null);
  const recRef = useRef<Rec | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  // Grow the text box up to ~5 lines.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, [text]);

  useEffect(
    () => () => {
      const r = recRef.current;
      r?.stream?.getTracks().forEach((t) => t.stop());
      if (hintTimer.current) clearTimeout(hintTimer.current);
    },
    [],
  );

  const flash = (msg: string) => {
    setHint(msg);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(null), 2000);
  };

  const send = () => {
    const t = text.trim();
    if (!t || disabled) return;
    onSendText(t);
    setText("");
    onSent();
    box.current?.focus();
  };

  const fill = (s: string) => {
    setText(s);
    requestAnimationFrame(() => {
      const el = box.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(s.length, s.length);
    });
  };

  // ---------- hold to record ----------

  const startRecording = async (r: Rec) => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setRec("idle");
      recRef.current = null;
      flash("Voice notes need a newer browser");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      if (recRef.current === r) recRef.current = null;
      setRec("idle");
      flash("Mic is blocked. Allow it to send voice notes");
      return;
    }
    if (r.released || recRef.current !== r) {
      // Let go while the permission prompt was up.
      stream.getTracks().forEach((t) => t.stop());
      setRec("idle");
      flash("Hold the mic while you talk");
      return;
    }
    const mime = pickMime();
    let mr: MediaRecorder;
    try {
      mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      recRef.current = null;
      setRec("idle");
      flash("Couldn't start the mic");
      return;
    }
    r.stream = stream;
    r.mr = mr;
    mr.ondataavailable = (e) => {
      if (e.data && e.data.size) r.chunks.push(e.data);
    };
    mr.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const ms = Date.now() - r.startedAt;
      if (r.cancelled) return;
      if (ms < MIN_MS) {
        flash("Hold the mic while you talk");
        return;
      }
      const blob = new Blob(r.chunks, { type: mr.mimeType || mime || "audio/webm" });
      if (blob.size < 800) {
        flash("Didn't catch that. Try again");
        return;
      }
      onSendVoice(blob);
      onSent();
    };
    mr.start(250);
    r.startedAt = Date.now();
    setStartedAt(r.startedAt);
    setStream(stream);
    setRec("recording");
    try {
      navigator.vibrate?.(12);
    } catch {
      /* not supported */
    }
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (disabled || recRef.current) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const b = e.currentTarget.getBoundingClientRect();
    const r: Rec = {
      id: ++seq.current,
      chunks: [],
      startedAt: Date.now(),
      released: false,
      cancelled: false,
      zone: { left: b.left - SLIDE, top: b.top - SLIDE, right: b.right + SLIDE, bottom: b.bottom + SLIDE },
    };
    recRef.current = r;
    setArmed(false);
    setRec("starting");
    void startRecording(r);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const r = recRef.current;
    if (!r) return;
    const z = r.zone;
    const out = e.clientX < z.left || e.clientX > z.right || e.clientY < z.top || e.clientY > z.bottom;
    if (out !== r.cancelled) {
      r.cancelled = out;
      setArmed(out);
    }
  };

  const finish = (cancel: boolean) => {
    const r = recRef.current;
    if (!r) return;
    r.released = true;
    if (cancel) r.cancelled = true;
    recRef.current = null;
    if (r.mr && r.mr.state !== "inactive") {
      try {
        r.mr.stop();
      } catch {
        r.stream?.getTracks().forEach((t) => t.stop());
      }
    } else if (r.stream) {
      r.stream.getTracks().forEach((t) => t.stop());
    }
    if (r.cancelled && r.mr) flash("Voice note cancelled");
    setRec("idle");
    setArmed(false);
    setStream(null);
  };

  const recording = rec !== "idle";
  const hasText = text.trim().length > 0;
  const showChips = !hasText && !recording && !disabled;

  return (
    <div data-tg-composer className="tg-safe-bottom relative border-t border-line/80 bg-cream/95 backdrop-blur-md">
      {/* hint toast */}
      <div
        className={`pointer-events-none absolute inset-x-0 -top-11 flex justify-center transition-[opacity,transform] duration-200 ${
          hint ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
        }`}
        aria-live="polite"
      >
        {hint && <span className="rounded-full bg-ink/90 px-3.5 py-1.5 text-[13px] font-bold text-cream shadow-lg">{hint}</span>}
      </div>

      <div className="mx-auto max-w-[640px]">
        {/* Try saying… */}
        <div className="tg-collapse tg-chips" data-open={showChips}>
          <div>
            <div className="tg-noscrollbar flex gap-2 overflow-x-auto px-3 pt-2.5 pb-0.5">
              <span className="shrink-0 self-center pl-1 text-[12px] font-extrabold tracking-wide text-muted uppercase">Try saying</span>
              {BUBBLES.map((b) => b.line).map((s) => (
                <button
                  key={s}
                  type="button"
                  tabIndex={showChips ? 0 : -1}
                  onClick={() => fill(s)}
                  className="tg-press shrink-0 rounded-full border border-line bg-paper px-3.5 py-1.5 text-[14px] font-semibold whitespace-nowrap text-ink/85 hover:border-marigold/60"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-end gap-2 px-3 pt-2">
          <div
            className={`relative flex min-h-[48px] min-w-0 flex-1 items-center rounded-[24px] border bg-paper transition-colors ${
              recording ? (armed ? "border-memory/60" : "border-marigold/60") : "border-line focus-within:border-marigold/70"
            }`}
          >
            {recording ? (
              <div className="tg-panel-in flex w-full items-center gap-2.5 px-4 py-3 text-base select-none" role="status">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full transition-colors ${armed ? "bg-memory" : "tg-rec-dot bg-[#e5484d]"}`} />
                {rec === "recording" ? (
                  <span className="w-[2.6rem] shrink-0 font-semibold">
                    <Elapsed since={startedAt} />
                  </span>
                ) : (
                  <span className="text-muted">Starting mic…</span>
                )}
                {rec === "recording" && stream && !armed && <LiveLevel stream={stream} halo={micBtn} />}
                <span
                  className={`ml-auto flex shrink-0 items-center gap-1 text-[14px] font-bold whitespace-nowrap transition-colors ${armed ? "text-memory" : "text-muted"}`}
                >
                  {armed ? (
                    "Let go to cancel"
                  ) : (
                    <>
                      <span className="tg-nudge inline-block" aria-hidden>
                        ‹
                      </span>
                      Slide to cancel
                    </>
                  )}
                </span>
              </div>
            ) : (
              <textarea
                ref={box}
                rows={1}
                value={text}
                disabled={disabled}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    send();
                  }
                }}
                enterKeyHint="send"
                placeholder={disabled ? "Tell Nani who you are first" : "Message Nani's team"}
                aria-label="Message"
                className="max-h-[132px] w-full resize-none bg-transparent px-4 py-3 text-base leading-[1.35] outline-none placeholder:text-muted/80 disabled:cursor-not-allowed"
              />
            )}
          </div>

          {hasText && !recording ? (
            <button
              type="button"
              onClick={send}
              disabled={disabled}
              aria-label="Send"
              className="tg-press flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-marigold text-white shadow-[0_2px_6px_rgba(242,154,14,0.35)] disabled:opacity-40"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
                <path d="M10 16V4M4.5 9.5 10 4l5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ) : (
            <button
              ref={micBtn}
              type="button"
              aria-label="Hold to record a voice note"
              disabled={disabled}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={() => finish(false)}
              onPointerCancel={() => finish(true)}
              onContextMenu={(e) => e.preventDefault()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") flash("Hold the mic while you talk");
              }}
              className={`tg-mic relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white transition-[transform,background-color] duration-200 disabled:opacity-40 ${
                recording ? (armed ? "scale-100 bg-memory" : "scale-110 bg-[#e5484d]") : "bg-marigold"
              }`}
            >
              {rec === "recording" && !armed && (
                <>
                  <span className="tg-mic-halo absolute inset-0 rounded-full bg-[#e5484d]/30" aria-hidden />
                  <span className="tg-mic-ring absolute inset-0 rounded-full bg-[#e5484d]" aria-hidden />
                </>
              )}
              <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden className="relative">
                <rect x="7" y="2.5" width="6" height="10" rx="3" fill="currentColor" />
                <path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
