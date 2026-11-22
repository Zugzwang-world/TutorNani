"use client";
// One scene per wall cue (PLAN C4). Pure render plus CSS animations from wall.css.
import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { config } from "@/lib/config";
import type { Cue } from "@/lib/types";

export interface SpellTile {
  letter: string;
  state: "idle" | "right" | "wrong";
}

export interface SpellBoard {
  word: string;
  gap: number; // 1-based
  tiles: SpellTile[];
  filled: boolean;
}

type Vars = CSSProperties & Record<`--${string}`, string | number>;

const PALETTE = ["#f29a0e", "#2f7de1", "#1f9d55", "#7c4ddb", "#e0457b", "#14b8a6"];

// Animal sound ids from CONTRACTS (animal_<name>) to the emoji shown while the toy plays it.
const ANIMAL_EMOJI: Record<string, string> = {
  lion: "🦁",
  cow: "🐄",
  cat: "🐱",
  dog: "🐶",
  elephant: "🐘",
  monkey: "🐒",
  duck: "🦆",
  sheep: "🐑",
  horse: "🐴",
  rooster: "🐓",
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Emoji({ children, className = "", style }: { children: string; className?: string; style?: Vars }) {
  return (
    <span className={`emoji ${className}`} style={style} aria-hidden>
      {children}
    </span>
  );
}

// Deterministic sparkle/confetti layout (no randomness during render).
function spread(n: number, seed: number) {
  return Array.from({ length: n }, (_, i) => ({
    left: (i * 37 + seed * 13) % 100,
    top: (i * 53 + seed * 29) % 100,
    delay: ((i * 7) % 10) / 4,
    color: PALETTE[i % PALETTE.length],
    turn: (i * 47) % 360,
    dur: 2.2 + ((i * 13) % 11) / 10,
  }));
}

export function IdleScene() {
  return (
    <div className="wall-scene">
      {spread(18, 1).map((s, i) => (
        <span
          key={i}
          className="wall-star"
          style={{ left: `${s.left}%`, top: `${s.top * 0.8}%`, animationDelay: `${s.delay}s` } as Vars}
        />
      ))}
      <span className="wall-aura" />
      <Emoji className="wall-breathe" style={{ fontSize: "42cqmin" }}>
        👵
      </Emoji>
      <p className="wall-caption wall-soft">{config.grandmaName} is here</p>
    </div>
  );
}

export function ThinkingScene() {
  return (
    <div className="wall-scene">
      <div className="wall-think">
        <div className="wall-cloud">
          <span className="wall-dot" />
          <span className="wall-dot" style={{ animationDelay: "0.2s" }} />
          <span className="wall-dot" style={{ animationDelay: "0.4s" }} />
        </div>
        <span className="wall-puff wall-puff-1" />
        <span className="wall-puff wall-puff-2" />
        <Emoji className="wall-tilt" style={{ fontSize: "40cqmin" }}>
          👵
        </Emoji>
      </div>
    </div>
  );
}

/**
 * [[show 🌙 Moon | chand | ⭐]] (R6.4): a big emoji, the English word in letter tiles with its first letter lit,
 * the Hindi word under it, and up to two small emojis drifting nearby. `[[show 🥭 Mango]]` has only the first two.
 */
export function ShowScene({ emoji, word, hindi, extras = [] }: { emoji: string; word: string; hindi?: string; extras?: string[] }) {
  const chars = Array.from(word);
  const lit = chars.findIndex((c) => /\p{L}|\p{N}/u.test(c));
  const step = chars.length > 8 ? 0.05 : 0.08;
  const wordEnd = 0.35 + chars.length * step;
  return (
    <div className="wall-scene wall-show">
      <div className="wall-show-art">
        {extras.slice(0, 2).map((e, i) => (
          <Emoji key={i} className={`wall-extra wall-extra-${i}`}>
            {e}
          </Emoji>
        ))}
        <div className="wall-pop">
          <Emoji className="wall-floaty" style={{ fontSize: hindi ? "36cqmin" : "40cqmin" }}>
            {emoji}
          </Emoji>
        </div>
      </div>
      <p className="wall-show-word" style={{ "--len": chars.length } as Vars} aria-label={word}>
        {chars.map((c, i) =>
          c.trim() === "" ? (
            <span key={i} className="wall-show-space" aria-hidden />
          ) : (
            <span
              key={i}
              aria-hidden
              className={`wall-show-tile ${i === lit ? "wall-show-lit" : ""}`}
              style={{ animationDelay: `${0.35 + i * step}s`, "--glow-at": `${wordEnd + 0.1}s` } as Vars}
            >
              {c}
            </span>
          ),
        )}
      </p>
      {hindi && (
        <p className="wall-show-hindi" style={{ animationDelay: `${wordEnd + 0.05}s` }}>
          {hindi}
        </p>
      )}
    </div>
  );
}

export function SpellScene({ board }: { board: SpellBoard }) {
  const gapRef = useRef<HTMLSpanElement>(null);
  const tileRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [fly, setFly] = useState<{ i: number; dx: number; dy: number } | null>(null);
  const rightIdx = board.tiles.findIndex((t) => t.state === "right");

  // Measure where the right tile must fly to reach the gap.
  useLayoutEffect(() => {
    if (rightIdx < 0 || fly?.i === rightIdx) return;
    const t = tileRefs.current[rightIdx];
    const g = gapRef.current;
    if (!t || !g) return;
    const a = t.getBoundingClientRect();
    const b = g.getBoundingClientRect();
    setFly({ i: rightIdx, dx: b.left + b.width / 2 - (a.left + a.width / 2), dy: b.top + b.height / 2 - (a.top + a.height / 2) });
  }, [rightIdx, fly]);

  const letters = board.word.split("");
  return (
    <div className="wall-scene wall-spell">
      <div className={`wall-letters ${board.filled ? "wall-done" : ""}`} style={{ "--len": letters.length } as Vars}>
        {letters.map((l, i) =>
          i === board.gap - 1 ? (
            <span key={i} ref={gapRef} className={`wall-letter wall-gap ${board.filled ? "wall-gap-filled" : ""}`}>
              {board.filled ? <span className="wall-landed">{l}</span> : <span className="wall-blink">?</span>}
            </span>
          ) : (
            <span key={i} className="wall-letter">
              {l}
            </span>
          ),
        )}
      </div>
      <div className="wall-tiles">
        {board.tiles.map((t, i) => {
          const flying = t.state === "right" && fly?.i === i;
          const cls =
            t.state === "wrong" ? "wall-tile-wrong" : t.state === "right" ? (flying ? "wall-tile-fly" : "wall-tile-glow") : "";
          return (
            <div
              key={i}
              ref={(el) => {
                tileRefs.current[i] = el;
              }}
              className={`wall-tile ${cls}`}
              style={
                {
                  "--c": PALETTE[i % PALETTE.length],
                  "--dx": `${flying ? fly!.dx : 0}px`,
                  "--dy": `${flying ? fly!.dy : 0}px`,
                  animationDelay: t.state === "idle" ? `${0.15 * i}s` : undefined,
                } as Vars
              }
            >
              {t.letter}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function LetterScene({ letter, result }: { letter: string; result: "right" | "wrong" }) {
  return (
    <div className="wall-scene">
      <div
        className={`wall-tile wall-tile-solo ${result === "right" ? "wall-tile-glow" : "wall-tile-wrong"}`}
        style={{ "--c": result === "right" ? "#1f9d55" : "#e0457b" } as Vars}
      >
        {letter}
      </div>
    </div>
  );
}

export function CountScene({ cue }: { cue: Extract<Cue, { type: "count" }> }) {
  const a = Math.max(0, Math.min(10, cue.a));
  const b = cue.b === undefined ? undefined : Math.max(0, Math.min(10, cue.b));
  const total = a + (b ?? 0);
  const step = total <= 3 ? 0.4 : total <= 6 ? 0.3 : 0.2; // seconds between items
  const half = step * 0.6; // the "+" and "=" take a shorter beat
  const both = !!cue.both; // [[count 🥭 3 both]] (R6.5): names under every number make items taller, so emojis shrink
  const size = both
    ? total <= 3 ? 20 : total <= 5 ? 14 : total <= 8 ? 9.5 : 7.5
    : total <= 3 ? 24 : total <= 5 ? 18 : total <= 8 ? 13 : 10;

  // One timeline for the whole scene: items, then "+", more items, then "=" and the answer.
  let t = 0;
  const at: number[] = [];
  for (let i = 0; i < a; i++) {
    at.push(t);
    t += step;
  }
  let plusAt = 0;
  let eqAt = 0;
  if (b !== undefined) {
    plusAt = t;
    t += half;
    for (let i = 0; i < b; i++) {
      at.push(t);
      t += step;
    }
    eqAt = t;
    t += half;
  }
  const answerAt = t;
  const sumDelay = (x: number) => ({ animationDelay: `${x}s` });
  // Every number also shows its Hindi and English names, "ek · one". Up to 4 items the names sit on one line;
  // more items stack them so the row still fits.
  const names = (n: number, at: number, cls = "") => (
    <span className={`wall-count-names ${cls}`} style={{ animationDelay: `${at}s` }}>
      <b>{HINDI_NUM[n] ?? n}</b>
      <i aria-hidden>·</i>
      <span>{ENGLISH_NUM[n] ?? n}</span>
    </span>
  );

  const item = (n: number) => (
    <div key={n} className="wall-count-item" style={sumDelay(at[n - 1])}>
      <Emoji style={{ fontSize: `${size}cqmin` }}>{cue.emoji}</Emoji>
      <span className="wall-count-num" style={{ color: PALETTE[(n - 1) % PALETTE.length], animationDelay: `${at[n - 1] + 0.12}s` }}>
        {n}
      </span>
      {both && names(n, at[n - 1] + 0.18)}
    </div>
  );
  return (
    <div
      className={`wall-scene ${both ? "wall-count-both" : ""} ${both && total > 4 ? "wall-count-many" : ""}`}
      style={{ "--names": `${Math.max(2.6, size * 0.22)}cqmin` } as Vars}
    >
      <div className="wall-count-row">
        {Array.from({ length: a }, (_, i) => item(i + 1))}
        {b !== undefined && (
          <>
            <span className="wall-plus" style={sumDelay(plusAt)}>
              +
            </span>
            {Array.from({ length: b }, (_, i) => item(a + i + 1))}
          </>
        )}
      </div>
      <p className="wall-sum">
        {b !== undefined ? (
          <>
            <span className="wall-sum-p" style={sumDelay(a > 0 ? at[a - 1] + 0.1 : 0)}>
              {a}
            </span>
            <span className="wall-sum-p" style={sumDelay(plusAt)}>
              +
            </span>
            <span className="wall-sum-p" style={sumDelay(b > 0 ? at[total - 1] + 0.1 : plusAt)}>
              {b}
            </span>
            <span className="wall-sum-p" style={sumDelay(eqAt)}>
              =
            </span>
            <span className="wall-sum-p wall-sum-total" style={sumDelay(answerAt)}>
              {total}
            </span>
          </>
        ) : (
          <span className="wall-sum-p wall-sum-total" style={sumDelay(answerAt)}>
            {total}
          </span>
        )}
      </p>
      {both && b !== undefined && names(total, answerAt + 0.1, "wall-sum-names")}
    </div>
  );
}

// Number names for count cards with "both" (sums reach 20).
const HINDI_NUM = ["shunya", "ek", "do", "teen", "chaar", "paanch", "chhah", "saat", "aath", "nau", "das", "gyaarah", "baarah", "terah", "chaudah", "pandrah", "solah", "satrah", "athaarah", "unnees", "bees"];
const ENGLISH_NUM = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];

export function ChoicesScene({ items }: { items: { emoji: string; label: string }[] }) {
  const list = items.slice(0, 4);
  return (
    <div className="wall-scene">
      <p className="wall-title wall-rise">What next?</p>
      <div className={`wall-cards ${list.length === 4 ? "wall-cards-4" : ""}`}>
        {list.map((it, i) => (
          <div key={i} className="wall-card" style={{ "--c": PALETTE[i % PALETTE.length], animationDelay: `${0.1 + i * 0.12}s` } as Vars}>
            <Emoji className="wall-card-emoji">{it.emoji}</Emoji>
            <span className="wall-card-label">{it.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CheerScene({ emoji }: { emoji: string }) {
  return (
    <div className="wall-scene">
      <div className="wall-confetti" aria-hidden>
        {spread(40, 3).map((c, i) => (
          <span
            key={i}
            style={
              {
                left: `${c.left}%`,
                background: c.color,
                animationDelay: `${c.delay * 0.8}s`,
                animationDuration: `${c.dur}s`,
                "--turn": `${c.turn}deg`,
                width: i % 3 === 0 ? "1.4cqmin" : "2.2cqmin",
              } as Vars
            }
          />
        ))}
      </div>
      <div className="wall-burst" />
      <Emoji className="wall-jump" style={{ fontSize: "44cqmin" }}>
        {emoji}
      </Emoji>
    </div>
  );
}

const DANCERS = ["🎵", "🐘", "🦚", "🐒", "🎶"];

export function SongScene() {
  return (
    <div className="wall-scene">
      <div className="wall-dance-row">
        {DANCERS.map((e, i) => (
          <Emoji key={i} className="wall-dance" style={{ fontSize: i % 2 ? "22cqmin" : "15cqmin", animationDelay: `${i * 0.18}s` }}>
            {e}
          </Emoji>
        ))}
      </div>
      {spread(10, 5).map((s, i) => (
        <Emoji
          key={i}
          className="wall-note"
          style={{ left: `${s.left}%`, fontSize: "7cqmin", animationDelay: `${s.delay * 1.2}s` }}
        >
          {i % 2 ? "🎶" : "🎵"}
        </Emoji>
      ))}
    </div>
  );
}

export function CallScene({ who }: { who: "mumma" | "papa" }) {
  const label = config.parents.find((p) => p.toLowerCase() === who) ?? cap(who);
  return (
    <div className="wall-scene">
      <div className="wall-phone">
        <span className="wall-ring" />
        <span className="wall-ring" style={{ animationDelay: "0.7s" }} />
        <Emoji className="wall-wiggle" style={{ fontSize: "38cqmin" }}>
          📞
        </Emoji>
      </div>
      <p className="wall-word wall-rise">{label}</p>
    </div>
  );
}

export function SoundScene({ name }: { name: string }) {
  const emoji = ANIMAL_EMOJI[name] ?? "🐾";
  return (
    <div className="wall-scene">
      <div className="wall-phone">
        <span className="wall-ring wall-ring-soft" />
        <span className="wall-ring wall-ring-soft" style={{ animationDelay: "0.5s" }} />
        <Emoji className="wall-roar" style={{ fontSize: "44cqmin" }}>
          {emoji}
        </Emoji>
      </div>
      <p className="wall-caption wall-rise">{cap(name)}</p>
    </div>
  );
}
