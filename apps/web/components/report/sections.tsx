"use client";
// The report's sections (R7.4), each a visual: three lines, the word garden, days, feelings, tricky spots,
// routine and best moments. Learning (garland, petals, diyas) is in learning.tsx.
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { AREA, PERIOD_WORD, clock12, dayShort, hash, weatherOf, whenSaid } from "./format";
import type { ReportData, ReportDay, ReportMoment, ReportWord } from "./types";

function Emoji({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`emoji ${className}`} aria-hidden>
      {children}
    </span>
  );
}

// ---------- 1. in three lines ----------

export function Lines({ r }: { r: ReportData }) {
  return (
    <section className="rp-area-lines" aria-labelledby="rp-lines">
      <h2 id="rp-lines" className="sr-only">
        In three lines
      </h2>
      <ul key={`${r.view}${r.pending}`} className="rp-lines rp-fade space-y-3" data-pending={r.pending}>
        {r.summary.map((l, i) => (
          <li key={i} className="flex gap-3.5">
            <span className="min-w-0">{l}</span>
          </li>
        ))}
      </ul>
      {r.pending ? (
        <p className="rp-writing mt-3 text-[14.5px] font-bold text-[#b25b00]" aria-live="polite">
          📔 Memory is writing {r.childName}&apos;s day…
        </p>
      ) : null}
      <h3 className="mt-7 flex items-center gap-2 text-[17px] font-extrabold">
        <Emoji className="text-[20px]">🌙</Emoji> Ask him at bedtime
      </h3>
      <ul key={`s${r.view}${r.pending}`} className="rp-fade mt-3 grid gap-2.5 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
        {r.starters.map((s, i) => (
          <li key={i} className="rp-starter px-4 py-3" style={{ animationDelay: `${i * 60}ms` }}>
            {s}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------- 2. the word garden ----------

const GARDEN_MAX = 24;

export function Garden({ r }: { r: ReportData }) {
  const [picked, setPicked] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const words = all ? r.words : r.words.slice(-GARDEN_MAX);
  const sel = r.words.find((w) => w.en === picked) ?? null;
  const fresh = r.words.filter((w) => w.isNew).length;
  return (
    <section className="rp-area-garden" aria-labelledby="rp-garden">
      <h2 id="rp-garden" className="rp-h2">
        New words
      </h2>
      <p className="rp-sub mt-1">
        {r.words.length
          ? `${fresh ? `The bright ones are new ${PERIOD_WORD[r.view]}. ` : ""}Tap a word for when he first said it.`
          : `No new words ${PERIOD_WORD[r.view]} yet. They grow here as he plays.`}
      </p>
      {r.words.length ? (
        <>
          <div key={r.view} className="rp-garden mt-4" role="group" aria-label="Words">
            {words.map((w, k) => (
              <Plant key={w.en} w={w} k={k} on={picked === w.en} onTap={() => setPicked(picked === w.en ? null : w.en)} />
            ))}
          </div>
          {r.words.length > GARDEN_MAX ? (
            <button type="button" onClick={() => setAll(!all)} className="rp-focus mt-3 rounded-full px-1 text-[15px] font-extrabold text-[#b25b00] underline decoration-2 underline-offset-4">
              {all ? "Show fewer" : `Show all ${r.words.length} words`}
            </button>
          ) : null}
          <WordNote w={sel} />
        </>
      ) : null}
    </section>
  );
}

function Plant({ w, k, on, onTap }: { w: ReportWord; k: number; on: boolean; onTap: () => void }) {
  const h = hash(w.en);
  const stem = 16 + (h % 5) * 6;
  return (
    <button
      type="button"
      className="rp-plant rp-sprout"
      data-new={w.isNew}
      data-side={h % 2 ? "l" : "r"}
      aria-pressed={on}
      aria-label={`${w.en}${w.hi ? `, ${w.hi}` : ""}`}
      onClick={onTap}
      style={{ "--k": k } as CSSProperties}
    >
      <span className="rp-bloom">
        <Emoji>{w.emoji}</Emoji>
      </span>
      <span className="rp-stem" style={{ height: stem }} />
      <span className="rp-ground" />
      <span className="rp-tag">
        <span className="rp-display block text-[16px] font-bold">{w.en}</span>
        {w.hi && w.hi.toLowerCase() !== w.en.toLowerCase() ? <span className="block text-[13px] text-[#6b5a48] italic">{w.hi}</span> : null}
      </span>
    </button>
  );
}

function WordNote({ w }: { w: ReportWord | null }) {
  return (
    <div style={{ display: "grid", gridTemplateRows: w ? "1fr" : "0fr", transition: "grid-template-rows 260ms cubic-bezier(0.23,1,0.32,1)" }}>
      <div className="overflow-hidden">
        {w ? (
          <div key={w.en} className="rp-note rp-fade mt-4 flex gap-4 p-4" aria-live="polite">
            <Emoji className="text-[44px]">{w.emoji}</Emoji>
            <div className="min-w-0">
              <p className="rp-display text-[22px] leading-tight font-bold">
                {w.en}
                {w.hi && w.hi.toLowerCase() !== w.en.toLowerCase() ? <span className="ml-2 text-[17px] font-semibold text-[#6b5a48] italic">{w.hi}</span> : null}
              </p>
              <p className="mt-1 text-[15px] text-[#6b5a48]">{w.firstSaid ? `First met ${whenSaid(w.firstSaid)}` : "Met with Nani"}</p>
              <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[13px] font-bold" style={{ background: `${AREA[w.area].color}33`, color: AREA[w.area].deep }}>
                {AREA[w.area].name}
              </p>
              {w.quote ? <p className="rp-display mt-2 text-[19px] leading-snug font-semibold">&ldquo;{w.quote}&rdquo;</p> : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ---------- 4. days with Nani ----------

function level(d: ReportDay): number {
  if (!d.played) return 0;
  return d.newWords >= 3 ? 4 : d.newWords === 2 ? 3 : d.newWords === 1 ? 2 : 1;
}

export function Days({ r }: { r: ReportData }) {
  const lastPlayed = [...r.days].reverse().find((d) => d.played && d.day >= r.from)?.day ?? r.to;
  const [picked, setPicked] = useState<string | null>(null);
  const sel = r.days.find((d) => d.day === (picked ?? lastPlayed)) ?? null;
  // weeks as columns, Monday first; blanks before the first day
  const cells = useMemo(() => {
    if (!r.days.length) return [];
    const first = new Date(`${r.days[0].day}T12:00:00Z`).getUTCDay(); // 0 = Sunday
    const pad = (first + 6) % 7;
    return [...Array.from({ length: pad }, () => null), ...r.days];
  }, [r.days]);
  // a month's label sits over the first week that starts in it (like GitHub's)
  const months = useMemo(() => {
    const out: { col: number; label: string }[] = [];
    for (let col = 0; col * 7 < cells.length; col++) {
      const c = cells.slice(col * 7, col * 7 + 7).find(Boolean);
      if (!c) continue;
      const m = (cells[col * 7] ?? c).day.slice(5, 7);
      if (!out.length || out[out.length - 1].label !== m) out.push({ col, label: m });
    }
    const NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return out.map((m) => ({ col: m.col, label: NAMES[+m.label - 1] }));
  }, [cells]);
  return (
    <section className="rp-area-days" aria-labelledby="rp-days">
      <h2 id="rp-days" className="rp-h2">
        Days with Nani
      </h2>
      <p className="rp-sub mt-1">Deeper marigold, more new words. Tap a day for its three lines.</p>
      <div className="rp-calvars mt-4 flex gap-2 overflow-x-auto pb-1">
        <div className="grid shrink-0 pt-[22px] text-[12px] leading-none text-[#8a7a6a]" style={{ gridTemplateRows: "repeat(7, var(--cell))", rowGap: "var(--gap)" }}>
          {["Mon", "", "Wed", "", "Fri", "", "Sun"].map((d, i) => (
            <span key={i} className="flex items-center">
              {d}
            </span>
          ))}
        </div>
        <div className="shrink-0">
          <div className="relative mb-1.5 h-4 text-[12px] leading-none text-[#8a7a6a]">
            {months.map((m) => (
              <span key={m.label} className="absolute" style={{ left: `calc(${m.col} * (var(--cell) + var(--gap)))` }}>
                {m.label}
              </span>
            ))}
          </div>
          <div className="rp-cal" role="group" aria-label="Calendar of play">
            {cells.map((c, i) =>
              c ? (
                <button
                  key={c.day}
                  type="button"
                  className={`rp-cell rp-focus ${c.live ? "rp-live-dot" : ""}`}
                  data-lvl={level(c)}
                  data-out={c.day < r.from || c.day > r.to}
                  data-live={!!c.live}
                  aria-pressed={sel?.day === c.day}
                  aria-label={`${dayShort(c.day)}: ${c.played ? `played${c.newWords ? `, ${c.newWords} new word${c.newWords > 1 ? "s" : ""}` : ""}` : "no play"}`}
                  onClick={() => setPicked(c.day)}
                />
              ) : (
                <span key={`b${i}`} className="rp-cell" data-blank="true" />
              ),
            )}
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-[12.5px] text-[#8a7a6a]" aria-hidden>
        <span>No play</span>
        <span className="rp-cell inline-block h-3.5 w-3.5" />
        <span className="ml-2">Played</span>
        {[1, 2, 3, 4].map((l) => (
          <span key={l} className="rp-cell inline-block h-3.5 w-3.5" data-lvl={l} />
        ))}
        <span>more words</span>
      </div>
      {sel ? (
        <div key={sel.day} className="rp-note rp-fade mt-4 p-4" aria-live="polite">
          <p className="text-[15px] font-extrabold text-[#b25b00]">
            {dayShort(sel.day)}
            {sel.live ? ", today" : ""}
          </p>
          {sel.played && sel.summary?.length ? (
            <ul className="mt-1.5 space-y-1">
              {sel.summary.map((l, i) => (
                <li key={i} className="text-[16.5px] leading-snug font-semibold">
                  {l}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-[16px] text-[#6b5a48]">{sel.live ? `No playtime with Nani yet today.` : "No play with Nani that day."}</p>
          )}
        </div>
      ) : null}
    </section>
  );
}

// ---------- 5. feelings: the weather strip ----------

const minutes = (hhmm: string) => +hhmm.slice(0, 2) * 60 + +hhmm.slice(3, 5);

/** Today's strip runs from 7 am to 9 pm, stretched to fit any earlier or later moment. */
function dayRange(ms: ReportMoment[]): { lo: number; hi: number } {
  const mins = ms.map((m) => minutes(m.time));
  return { lo: Math.max(0, Math.min(7 * 60, Math.min(...mins) - 45)), hi: Math.min(24 * 60, Math.max(21 * 60, Math.max(...mins) + 45)) };
}

function placeMoments(r: ReportData): { m: ReportMoment; x: number; lane: number }[] {
  const ms = r.moods;
  if (!ms.length) return [];
  let pos: (m: ReportMoment) => number;
  if (r.view === "today") {
    const { lo, hi } = dayRange(ms);
    pos = (m) => (minutes(m.time) - lo) / (hi - lo);
  } else {
    const a = Date.parse(`${r.from}T00:00:00Z`);
    const b = Date.parse(`${r.to}T23:59:59Z`);
    pos = (m) => (Date.parse(`${m.day}T${m.time}:00Z`) - a) / (b - a);
  }
  // Moments too close to share a lane stack upwards; the sky grows to fit them.
  const gap = ms.length > 12 ? 5.5 : ms.length > 6 ? 7 : 9;
  const lanes: number[] = [];
  return ms.map((m) => {
    const x = 5 + Math.min(1, Math.max(0, pos(m))) * 90;
    let lane = lanes.findIndex((end) => x - end >= gap);
    if (lane < 0) lane = lanes.length;
    lanes[lane] = x;
    return { m, x, lane };
  });
}

function skyTicks(r: ReportData): { x: number; label: string }[] {
  if (r.view === "today") {
    if (!r.moods.length) return [];
    const { lo, hi } = dayRange(r.moods);
    const out: { x: number; label: string }[] = [];
    for (let h = Math.ceil(lo / 180) * 3; h * 60 <= hi; h += 3) out.push({ x: 6 + ((h * 60 - lo) / (hi - lo)) * 88, label: clock12(`${String(h % 24).padStart(2, "0")}:00`).replace(":00", "") });
    return out;
  }
  const a = Date.parse(`${r.from}T00:00:00Z`);
  const b = Date.parse(`${r.to}T23:59:59Z`);
  const days = Math.round((b - a) / 86_400_000);
  const step = r.view === "week" ? 1 : r.view === "month" ? 7 : 14;
  const out: { x: number; label: string }[] = [];
  for (let i = 0; i <= days; i += step) {
    const d = new Date(a + i * 86_400_000 + 43_200_000).toISOString().slice(0, 10);
    const label = r.view === "week" ? dayShort(d).split(" ")[0] : dayShort(d).split(" ").slice(1).join(" ");
    out.push({ x: 6 + ((a + i * 86_400_000 + 43_200_000 - a) / (b - a)) * 88, label });
  }
  return out;
}

export function Feelings({ r }: { r: ReportData }) {
  const placed = placeMoments(r);
  const size = r.moods.length > 12 ? 34 : r.moods.length > 6 ? 40 : 46;
  const lanes = Math.max(1, ...placed.map((p) => p.lane + 1));
  const skyH = Math.max(128, 20 + lanes * (size - 4) + 8);
  const fallback = [...r.moods].reverse().find((m) => m.helped) ?? r.moods[r.moods.length - 1] ?? null;
  const [picked, setPicked] = useState<number | null>(null);
  const selIdx = picked !== null && picked < r.moods.length ? picked : fallback ? r.moods.indexOf(fallback) : -1;
  const sel = selIdx >= 0 ? r.moods[selIdx] : null;
  const ticks = skyTicks(r);
  return (
    <section className="rp-area-feel" aria-labelledby="rp-feel">
      <h2 id="rp-feel" className="rp-h2">
        Feelings
      </h2>
      <p className="rp-sub mt-1">
        {r.moods.length ? "Moments when his feelings showed. Tap one for what happened." : `No big feelings noted ${PERIOD_WORD[r.view]}.`}
      </p>
      <div className="rp-sky mt-4" role="group" aria-label="Feelings across the period" style={{ height: skyH }}>
        {placed.map(({ m, x, lane }, i) => {
          const w = weatherOf(m.feeling);
          return (
            <button
              key={`${m.day}${m.time}${i}`}
              type="button"
              className="rp-moment rp-focus"
              style={{ left: `${x}%`, bottom: 12 + lane * (size - 4), width: size, height: size, marginLeft: -size / 2, fontSize: size * 0.6 }}
              aria-pressed={selIdx === i}
              aria-label={`${w.label}, ${dayShort(m.day)} ${clock12(m.time)}: ${m.what}`}
              onClick={() => setPicked(i)}
            >
              <Emoji>{w.emoji}</Emoji>
            </button>
          );
        })}
      </div>
      {ticks.length ? (
        <div className="relative mt-1.5 h-4 text-[12px] text-[#8a7a6a]" aria-hidden>
          {ticks.map((t) => (
            <span key={t.label + t.x} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${t.x}%` }}>
              {t.label}
            </span>
          ))}
        </div>
      ) : null}
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-[#6b5a48]" aria-hidden>
        <span>☀️ happy or excited</span>
        <span>⛅ calm or tired</span>
        <span>🌧️ upset, scared or sad</span>
      </p>
      {sel ? (
        <div key={`${sel.day}${sel.time}`} className="rp-note rp-fade mt-4 flex gap-3.5 p-4" aria-live="polite">
          <Emoji className="text-[36px]">{weatherOf(sel.feeling).emoji}</Emoji>
          <div className="min-w-0">
            <p className="text-[14.5px] font-extrabold text-[#b25b00]">
              {weatherOf(sel.feeling).label}, {r.view === "today" ? clock12(sel.time) : `${dayShort(sel.day)}, ${clock12(sel.time)}`}
            </p>
            <p className="mt-0.5 text-[17px] leading-snug font-bold">{sel.what}</p>
            {sel.helped ? (
              <p className="mt-1.5 text-[15.5px] leading-snug">
                <span className="font-extrabold text-[#4d7c3a]">What helped: </span>
                {sel.helped}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

// ---------- 6. tricky spots ----------

export function Tricky({ r }: { r: ReportData }) {
  return (
    <section className="rp-area-tricky" aria-labelledby="rp-tricky">
      <h2 id="rp-tricky" className="rp-h2">
        Working on
      </h2>
      <p className="rp-sub mt-1">{r.tricky.length ? "Still tricky, and one thing to try tonight." : "Nothing tricky right now."}</p>
      <ul className="mt-4 space-y-3">
        {r.tricky.map((t) => (
          <li key={t.what} className="rp-tricky px-4 py-3.5">
            <p className="rp-display text-[19px] leading-snug font-bold">{t.what}</p>
            <p className="mt-1.5 flex gap-2 text-[15.5px] leading-snug">
              <Emoji className="mt-0.5 text-[17px]">🌙</Emoji>
              <span>
                <span className="font-extrabold text-[#b25b00]">Try tonight: </span>
                {t.tip}
              </span>
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------- 7. routine ----------

function IconRow({ emoji, on, off = 0, label, text }: { emoji: string; on: number; off?: number; label: string; text: string }) {
  const MAX = 12;
  const shownOn = Math.min(on, MAX);
  const shownOff = Math.min(off, Math.max(0, MAX - shownOn));
  const more = on + off - shownOn - shownOff;
  return (
    <li className="py-3">
      <p className="text-[16px] font-extrabold">{label}</p>
      <div className="rp-icons mt-1.5 flex flex-wrap items-center gap-1" aria-hidden>
        {Array.from({ length: shownOn }, (_, i) => (
          <Emoji key={`a${i}`}>{emoji}</Emoji>
        ))}
        {Array.from({ length: shownOff }, (_, i) => (
          <span key={`b${i}`} className="emoji opacity-25 grayscale">
            {emoji}
          </span>
        ))}
        {more > 0 ? <span className="ml-1 text-[14px] font-bold text-[#6b5a48]">+{more}</span> : null}
        {!on && !off ? <span className="emoji opacity-20 grayscale">{emoji}</span> : null}
      </div>
      <p className="mt-1 text-[14.5px] text-[#6b5a48]">{text}</p>
    </li>
  );
}

export function Routine({ r }: { r: ReportData }) {
  const { water, calls, stories } = r.routine;
  const p = PERIOD_WORD[r.view];
  return (
    <section className="rp-area-routine" aria-labelledby="rp-routine">
      <h2 id="rp-routine" className="rp-h2">
        Routine
      </h2>
      <ul className="mt-1 divide-y divide-[#f0e4d4]">
        <IconRow
          emoji="💧"
          on={water.done}
          off={Math.max(0, water.asked - water.done)}
          label="Water when Nani reminded him"
          text={
            !water.asked
              ? `No water reminders ${p}`
              : water.done >= water.asked
                ? "Drank up every time Nani reminded him"
                : water.done * 2 >= water.asked
                  ? "Drank up most times Nani reminded him"
                  : water.done
                    ? "Drank up some of the times"
                    : "Not yet: try a cup together tonight"
          }
        />
        <IconRow emoji="📞" on={calls} label="Calls with Mumma and Papa" text={calls ? `${calls} call${calls > 1 ? "s" : ""} ${p}` : `No calls ${p}`} />
        <IconRow emoji="📖" on={stories} label="Stories and songs" text={stories ? `${stories} ${stories > 1 ? "times" : "time"} ${p}` : `None ${p} yet`} />
      </ul>
    </section>
  );
}

// ---------- 8. best moments ----------

export function Best({ r }: { r: ReportData }) {
  return (
    <section className="rp-area-best" aria-labelledby="rp-best">
      <h2 id="rp-best" className="rp-h2">
        Best moments
      </h2>
      {r.highlights.length ? (
        <ul key={r.view} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {r.highlights.map((h, i) => (
            <li key={`${h.day}${i}`} className="rp-best rp-fade px-5 pt-7 pb-4" style={{ animationDelay: `${i * 50}ms` }}>
              <span className="rp-best-mark" aria-hidden>
                &ldquo;
              </span>
              {h.quote ? <p className="rp-display relative text-[22px] leading-tight font-bold text-pretty">{h.quote}</p> : null}
              <p className={`relative text-pretty ${h.quote ? "mt-2 text-[15.5px] text-[#6b5a48]" : "rp-display text-[19px] leading-snug font-semibold"}`}>{h.text}</p>
              <p className="mt-3 text-[13px] font-bold text-[#b25b00]">{h.day === r.today ? "Today" : dayShort(h.day)}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rp-sub mt-1">Best moments show up here as he plays with Nani.</p>
      )}
    </section>
  );
}
