"use client";
// Section 3: the A to Z garland (learnt letters bloom, the next one glows), the four learning areas as petals,
// and counting 1 to 10 as diyas. Hand-made SVG; changes between views animate in place.
import type { CSSProperties } from "react";
import type { ProgressArea } from "@/lib/types";
import { AREA, HINDI_NUMBERS, PERIOD_WORD } from "./format";
import type { ReportData } from "./types";

const AZ = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const BALOO = { fontFamily: "var(--font-baloo), var(--font-sans)" } as const;

function knownLine(learnt: string[]): string {
  if (!learnt.length) return "His first letter is coming";
  const run = AZ.slice(0, learnt.length).join("") === [...learnt].sort().join("");
  if (run) return learnt.length === 1 ? "A is his" : `A to ${learnt[learnt.length - 1]} are his`;
  return `${learnt.length} letters are his`;
}

function Garland({ r }: { r: ReportData }) {
  const learnt = new Set(r.letters.learnt);
  const fresh = new Set(r.letters.fresh);
  const cur = r.letters.current;
  const R = 158;
  const at = (i: number) => {
    const a = ((-90 + (i * 360) / 26) * Math.PI) / 180;
    return { x: 200 + R * Math.cos(a), y: 200 + R * Math.sin(a) };
  };
  const forWord = cur ? (r.words.find((w) => w.isNew && w.en.toUpperCase().startsWith(cur)) ?? r.words.find((w) => w.en.toUpperCase().startsWith(cur))) : undefined;
  let k = 0;
  return (
    <div className="rp-ring" role="img" aria-label={`Letters: ${knownLine(r.letters.learnt)}.${cur ? ` Now learning ${cur}.` : ""}`}>
      <svg viewBox="0 0 400 400" className="block h-auto w-full" aria-hidden>
        <circle cx="200" cy="200" r={R} fill="none" stroke="#e9c993" strokeWidth="2" />
        {AZ.map((l, i) => {
          if (learnt.has(l) || l === cur) return null;
          const p = at(i);
          return (
            <g key={l} transform={`translate(${p.x} ${p.y})`}>
              <circle r="11.5" fill="#f3e6d3" />
              <text textAnchor="middle" dominantBaseline="central" fontSize="11.5" fontWeight="700" fill="#a8947c" style={BALOO} y="1">
                {l}
              </text>
            </g>
          );
        })}
        {AZ.map((l, i) => {
          if (!learnt.has(l) || l === cur) return null;
          const p = at(i);
          const isFresh = fresh.has(l);
          return (
            <g key={l} transform={`translate(${p.x} ${p.y})`}>
              <g className="rp-bead-in" style={{ "--k": k++ } as CSSProperties}>
                <circle className="rp-fresh-ring" r="23" fill="#ffe2a3" opacity={isFresh ? 1 : 0} />
                {Array.from({ length: 9 }, (_, j) => {
                  const a = (j * 2 * Math.PI) / 9;
                  return <circle key={j} cx={11.5 * Math.cos(a)} cy={11.5 * Math.sin(a)} r="7" fill={isFresh ? "#ea8500" : "#f29a0e"} style={{ transition: "fill 300ms ease" }} />;
                })}
                <circle r="11.5" fill="#ffb631" />
                <text textAnchor="middle" dominantBaseline="central" fontSize="15" fontWeight="800" fill="#4a2300" style={BALOO} y="1">
                  {l}
                </text>
              </g>
            </g>
          );
        })}
        {cur
          ? (() => {
              const p = at(AZ.indexOf(cur));
              return (
                <g transform={`translate(${p.x} ${p.y})`}>
                  <circle className="rp-glow" r="26" fill="#f29a0e" />
                  <circle r="21" fill="#fff6e2" stroke="#b25b00" strokeWidth="2.5" />
                  <text textAnchor="middle" dominantBaseline="central" fontSize="19" fontWeight="800" fill="#b25b00" style={BALOO} y="1">
                    {cur}
                  </text>
                </g>
              );
            })()
          : null}
      </svg>
      <div className="rp-ring-centre">
        <p className="rp-ring-letter" aria-hidden>
          {cur ?? r.letters.learnt[r.letters.learnt.length - 1] ?? "A"}
        </p>
        <p className="rp-ring-for">{cur ? (forWord ? `for ${forWord.en}` : "is next") : "learnt"}</p>
        <p className="rp-ring-known">{knownLine(r.letters.learnt)}</p>
      </div>
    </div>
  );
}

const ORDER: ProgressArea[] = ["language", "numbers", "feelings", "culture"];

function Petals({ r }: { r: ReportData }) {
  const max = Math.max(1, ...ORDER.map((a) => r.areas[a]));
  const L0 = 92;
  const W = 31;
  const petal = `M0,0 C${W},${-L0 * 0.3} ${W * 0.72},${-L0 * 0.93} 0,${-L0} C${-W * 0.72},${-L0 * 0.93} ${-W},${-L0 * 0.3} 0,0Z`;
  const top = ORDER.reduce((a, b) => (r.areas[b] > r.areas[a] ? b : a), "language" as ProgressArea);
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
      <svg viewBox="-104 -104 208 208" className="h-auto w-[176px] shrink-0" role="img" aria-label={`Most of ${PERIOD_WORD[r.view]}: ${AREA[top].name.toLowerCase()}`}>
        {/* the full-size petals, faint: what the real ones grow towards */}
        {ORDER.map((a, i) => (
          <path key={`g${a}`} d={petal} fill="none" stroke="#e8d6bd" strokeWidth="1.5" strokeDasharray="3 4" transform={`rotate(${i * 90 - 45})`} />
        ))}
        {ORDER.map((a, i) => {
          const v = r.areas[a];
          const s = (34 + 58 * Math.sqrt(v / max)) / L0;
          return (
            <path
              key={a}
              className="rp-petal"
              d={petal}
              fill={AREA[a].color}
              stroke={AREA[a].deep}
              strokeOpacity="0.35"
              strokeWidth="1.5"
              style={{ transform: `rotate(${i * 90 - 45}deg) scale(${s})` }}
            />
          );
        })}
        <circle r="14" fill="#f29a0e" />
        <circle r="6.5" fill="#ffd27a" />
      </svg>
      <ul className="min-w-[200px] flex-1 space-y-2.5">
        {ORDER.map((a) => (
          <li key={a} className="flex items-start gap-2.5">
            <span aria-hidden className="mt-[5px] h-3.5 w-3.5 shrink-0 rounded-[50%_50%_50%_0]" style={{ background: AREA[a].color, transform: "rotate(-45deg)" }} />
            <span className="min-w-0">
              <span className="block text-[16px] leading-tight font-extrabold">{AREA[a].name}</span>
              <span className="rp-sub block">{AREA[a].what}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Diya({ n, lit, bright }: { n: number; lit: boolean; bright: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 60 64" className="h-auto w-full max-w-[52px]" aria-hidden>
        <defs>
          <radialGradient id={`rp-f${n}`} cx="50%" cy="70%" r="70%">
            <stop offset="0%" stopColor="#fff3b0" />
            <stop offset="55%" stopColor="#ffc13b" />
            <stop offset="100%" stopColor="#f08a00" />
          </radialGradient>
        </defs>
        <g className="rp-flame" data-lit={bright} style={{ "--k": n, opacity: lit ? (bright ? 1 : 0.42) : 0, transform: lit ? undefined : "scale(0.4)" } as CSSProperties}>
          <circle cx="30" cy="25" r="15" fill="#ffd27a" opacity="0.35" />
          <path d="M30 5 C37 17 39 26 30 33 C21 26 23 17 30 5Z" fill={`url(#rp-f${n})`} />
        </g>
        <path d="M27 33 L33 33 L31 38 L29 38Z" fill="#6b3b17" opacity={lit ? 1 : 0.4} />
        <path d="M6 38 Q30 66 54 38 Z" fill={lit ? "#c4632a" : "#e3cdb7"} style={{ transition: "fill 400ms ease" }} />
        <ellipse cx="30" cy="38.5" rx="24" ry="4.5" fill={lit ? "#e58a4e" : "#efdcc8"} style={{ transition: "fill 400ms ease" }} />
      </svg>
      <span className={`rp-display mt-0.5 text-[17px] leading-none font-extrabold ${lit ? "text-ink" : "text-[#b9a68f]"}`}>{n}</span>
      <span className={`text-[11.5px] leading-tight ${lit ? "text-[#6b5a48]" : "text-[#c4b39f]"}`}>{HINDI_NUMBERS[n - 1]}</span>
    </div>
  );
}

function Diyas({ r }: { r: ReportData }) {
  const { upTo, inPeriod } = r.counting;
  return (
    <div>
      <div className="grid grid-cols-10 gap-1" role="img" aria-label={`Counts up to ${upTo}${inPeriod ? `; counted to ${inPeriod} ${PERIOD_WORD[r.view]}` : ""}`}>
        {Array.from({ length: 10 }, (_, i) => (
          <Diya key={i} n={i + 1} lit={i + 1 <= upTo} bright={i + 1 <= inPeriod} />
        ))}
      </div>
      <p key={r.view} className="rp-fade mt-3 text-[17px] leading-snug">
        <span className="font-extrabold">{upTo ? `Counts up to ${upTo}.` : "Counting is coming."}</span>{" "}
        <span className="text-[#6b5a48]">
          {inPeriod ? `The bright ones he counted ${r.view === "all" ? "with Nani" : PERIOD_WORD[r.view]}.` : `No counting ${PERIOD_WORD[r.view]}.`}
        </span>
      </p>
    </div>
  );
}

export function Learning({ r }: { r: ReportData }) {
  return (
    <section className="rp-area-learn" aria-labelledby="rp-learn">
      <h2 id="rp-learn" className="rp-h2">
        Learning
      </h2>
      <p className="rp-sub mt-1">The letter garland: bright flowers are his, the glowing one is next.</p>
      <div className="mt-3">
        <Garland r={r} />
      </div>
      <div className="mt-6">
        <h3 className="text-[17px] font-extrabold">What he explored {PERIOD_WORD[r.view]}</h3>
        <p className="rp-sub">
          {ORDER.some((a) => r.areas[a] > 0) ? "The bigger the petal, the more moments in that area." : `Nothing yet ${PERIOD_WORD[r.view]}: the petals grow as he plays.`}
        </p>
        <div className="mt-3">
          <Petals r={r} />
        </div>
      </div>
      <div className="mt-7">
        <h3 className="text-[17px] font-extrabold">Counting, 1 to 10</h3>
        <div className="mt-3">
          <Diyas r={r} />
        </div>
      </div>
    </section>
  );
}
