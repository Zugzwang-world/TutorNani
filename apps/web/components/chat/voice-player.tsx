"use client";
// Compact audio player for voice notes: play/pause, progress, time.
import { useEffect, useRef, useState } from "react";

function mmss(s: number): string {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

const BASE = [5, 9, 13, 8, 15, 11, 6, 12, 16, 10, 7, 13, 9, 14, 6, 11, 8, 12, 5, 9];

/** A waveform shape of its own for each note (stable per URL), so two notes don't look identical. */
function barsFor(src: string | null): number[] {
  if (!src) return BASE;
  let h = 2166136261;
  for (let i = 0; i < src.length; i++) h = Math.imul(h ^ src.charCodeAt(i), 16777619);
  return BASE.map((b, i) => {
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
    const jitter = ((h >>> 0) % 7) - 3;
    return Math.max(4, Math.min(18, b + jitter + (i === 0 || i === BASE.length - 1 ? -2 : 0)));
  });
}

export function VoicePlayer({ src, mine }: { src: string | null; mine: boolean }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [failed, setFailed] = useState(false);
  const BARS = barsFor(src);

  useEffect(() => {
    if (!src) return;
    const a = new Audio();
    a.preload = "metadata";
    a.src = src;
    audio.current = a;
    // Recorded webm often reports an endless duration until it has been read once: seek far ahead to learn it.
    let probing = false;
    const onMeta = () => {
      if (Number.isFinite(a.duration)) {
        setDur(a.duration);
        if (probing) {
          probing = false;
          a.currentTime = 0;
        }
      } else if (a.duration === Infinity && !probing) {
        probing = true;
        try {
          a.currentTime = 1e7;
        } catch {
          probing = false;
        }
      }
    };
    const onTime = () => {
      if (probing) return;
      setPos(a.currentTime);
      if (Number.isFinite(a.duration)) setDur(a.duration);
    };
    const onEnd = () => {
      setPlaying(false);
      setPos(0);
    };
    const onErr = () => {
      setFailed(true);
      setPlaying(false);
    };
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("durationchange", onMeta);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("ended", onEnd);
    a.addEventListener("error", onErr);
    return () => {
      a.pause();
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("durationchange", onMeta);
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("ended", onEnd);
      a.removeEventListener("error", onErr);
      audio.current = null;
    };
  }, [src]);

  const toggle = async () => {
    const a = audio.current;
    if (!a) return;
    if (playing) {
      a.pause();
      setPlaying(false);
      return;
    }
    try {
      setFailed(false);
      await a.play();
      setPlaying(true);
    } catch {
      setFailed(true);
    }
  };

  const progress = dur > 0 ? Math.min(1, pos / dur) : 0;
  const lit = Math.round(progress * BARS.length);

  return (
    <div className="flex items-center gap-2.5 py-0.5">
      <button
        type="button"
        onClick={toggle}
        disabled={!src}
        aria-label={playing ? "Pause voice note" : "Play voice note"}
        className={`tg-press flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white disabled:opacity-40 ${
          mine ? "bg-[#c97a00]" : "bg-ink/80"
        }`}
      >
        {playing ? (
          <svg key="pause" width="14" height="14" viewBox="0 0 14 14" aria-hidden className="tg-icon-swap">
            <rect x="2" y="1.5" width="3.5" height="11" rx="1" fill="currentColor" />
            <rect x="8.5" y="1.5" width="3.5" height="11" rx="1" fill="currentColor" />
          </svg>
        ) : (
          <svg key="play" width="14" height="14" viewBox="0 0 14 14" aria-hidden className="tg-icon-swap">
            <path d="M3.5 1.8v10.4a.8.8 0 0 0 1.2.7l8.4-5.2a.8.8 0 0 0 0-1.4L4.7 1.1a.8.8 0 0 0-1.2.7Z" fill="currentColor" />
          </svg>
        )}
      </button>
      <div className="flex h-6 items-center gap-[3px]" aria-hidden>
        {BARS.map((h, i) => (
          <span
            key={i}
            className={`w-[3px] rounded-full transition-colors duration-150 ${
              i < lit ? (mine ? "bg-[#c97a00]" : "bg-ink/75") : mine ? "bg-[#c97a00]/30" : "bg-ink/20"
            }`}
            style={{ height: h }}
          />
        ))}
      </div>
      <span className="min-w-[2.5rem] text-[13px] tabular-nums text-muted">
        {failed ? "—" : mmss(playing || pos > 0 ? pos : dur)}
      </span>
    </div>
  );
}
