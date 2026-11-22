"use client";
// Presenter control panel (PLAN C13): the demo clock, reset, clock buttons, next job, evening brief,
// the wall's timings corner, and the last 10 turns' timings. Live from Supabase; writes go through the API.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { clockParts, demoNow } from "@/lib/clock";
import { CHILD_ID } from "@/lib/config";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { Turn } from "@/lib/types";

// R4.4: +30 min, +2 h and Real time only (the jumps to 12:00, 19:00 and 20:30 are gone: reminders run on the real clock).
const MIN = 60_000;

const btn =
  "rounded-xl border border-line bg-paper px-4 py-3 text-base font-semibold text-ink shadow-sm transition-transform active:scale-[0.97] disabled:opacity-50";
const btnPrimary = "rounded-xl bg-marigold px-4 py-3 text-base font-bold text-ink shadow-sm transition-transform active:scale-[0.97] disabled:opacity-50";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-paper p-4 shadow-sm">
      <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted">{title}</h2>
      {children}
    </section>
  );
}

const ms = (n: unknown) => (typeof n === "number" ? Math.round(n).toString() : "·");

function turnTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(
    new Date(iso),
  );
}

export default function Presenter() {
  const [offsetMs, setOffsetMs] = useState(0);
  const [showTimings, setShowTimings] = useState(false);
  const [now, setNow] = useState<Date | null>(null); // null on the server render: no Date.now() while prerendering
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<{ text: string; bad?: boolean } | null>(null);
  const offsetRef = useRef(0);

  const applyState = useCallback((s: { clock_offset_ms?: number; show_timings?: boolean } | null | undefined) => {
    if (!s) return;
    if (typeof s.clock_offset_ms === "number") {
      offsetRef.current = s.clock_offset_ms;
      setOffsetMs(s.clock_offset_ms);
      setNow(demoNow(s.clock_offset_ms));
    }
    if (typeof s.show_timings === "boolean") setShowTimings(s.show_timings);
  }, []);

  // The demo clock ticks every second.
  useEffect(() => {
    const tick = () => setNow(demoNow(offsetRef.current));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Live: demo_state and the last 10 turns.
  useEffect(() => {
    const sb = supabaseBrowser();
    const filter = `child_id=eq.${CHILD_ID}`;
    sb.from("demo_state").select("clock_offset_ms, show_timings").eq("child_id", CHILD_ID).maybeSingle().then(({ data }) => applyState(data));
    sb.from("turns")
      .select("*")
      .eq("child_id", CHILD_ID)
      .order("id", { ascending: false })
      .limit(10)
      .then(({ data }) => {
        if (data) setTurns(data as Turn[]);
      });
    const ch = sb
      .channel(`presenter-db:${CHILD_ID}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "demo_state", filter }, (p) => applyState(p.new as { clock_offset_ms?: number }))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "turns", filter }, (p) => {
        const t = p.new as Turn;
        setTurns((cur) => [t, ...cur.filter((x) => x.id !== t.id)].slice(0, 10));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "turns", filter }, (p) => {
        const t = p.new as Turn;
        setTurns((cur) => cur.map((x) => (x.id === t.id ? { ...x, ...t } : x)));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "turns" }, () => {
        sb.from("turns").select("*").eq("child_id", CHILD_ID).order("id", { ascending: false }).limit(10).then(({ data }) => setTurns((data as Turn[]) ?? []));
      })
      .subscribe();
    return () => {
      sb.removeChannel(ch);
    };
  }, [applyState]);

  const run = async (key: string, url: string, body: unknown, ok: (data: Record<string, unknown>) => string, missing?: string) => {
    setBusy(key);
    setStatus(null);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (res.status === 404 && missing) setStatus({ text: missing, bad: true });
      else if (!res.ok || data.ok === false) setStatus({ text: `${key} failed: ${String(data.error ?? res.status)}`, bad: true });
      else {
        applyState(data.state as { clock_offset_ms?: number; show_timings?: boolean } | undefined);
        setStatus({ text: ok(data) });
      }
    } catch (e) {
      setStatus({ text: `${key} failed: ${(e as Error).message}`, bad: true });
    } finally {
      setBusy(null);
    }
  };

  const presenter = (key: string, body: Record<string, unknown>, done: string) => run(key, "/api/presenter", body, () => done);

  const parts = now ? clockParts(now) : null;
  const secs = now ? String(now.getUTCSeconds()).padStart(2, "0") : "--";
  const shift = Math.round(offsetMs / MIN);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 pb-16">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-extrabold">Presenter</h1>
        <nav className="flex gap-4 text-sm font-semibold">
          <Link href="/" className="text-routine underline">Parent site</Link>
          <Link href="/toy" className="text-routine underline">Toy</Link>
          <Link href="/home-base" className="text-routine underline">Wall</Link>
        </nav>
      </header>

      <Card title="Demo clock (India time)">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="text-5xl font-extrabold tabular-nums" suppressHydrationWarning>
            {parts ? `${parts.hhmm}:${secs}` : "--:--:--"}
          </div>
          <div className="text-right text-sm text-muted">
            <div suppressHydrationWarning>{parts?.label ?? ""}</div>
            <div>{shift === 0 ? "real time" : `${shift > 0 ? "+" : ""}${shift} min from real time`}</div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className={btn} disabled={!!busy} onClick={() => presenter("+30 min", { action: "clock", addMs: 30 * MIN }, "Clock moved +30 min")}>+30 min</button>
          <button className={btn} disabled={!!busy} onClick={() => presenter("+2 h", { action: "clock", addMs: 120 * MIN }, "Clock moved +2 h")}>+2 h</button>
          <button className={btn} disabled={!!busy} onClick={() => presenter("real time", { action: "real" }, "Clock back to real time")}>Real time</button>
        </div>
      </Card>

      <Card title="Routine and brief">
        <div className="flex flex-wrap gap-2">
          <button className={btnPrimary} disabled={!!busy} onClick={() => presenter("fire next job", { action: "fire_next" }, "Asked the toy to fire the next job (needs /toy open)")}>
            Fire the next job now
          </button>
          <button
            className={btnPrimary}
            disabled={!!busy}
            onClick={() => run("brief", "/api/brief", {}, () => "Evening brief triggered. Watch the parent chat.", "The evening brief is not built yet (/api/brief returned 404).")}
          >
            Trigger the evening brief
          </button>
        </div>
      </Card>

      <Card title="Wall and demo">
        <div className="flex flex-wrap items-center gap-2">
          <button className={btn} disabled={!!busy} onClick={() => presenter("timings", { action: "timings", show: !showTimings }, showTimings ? "Timings corner hidden" : "Timings corner shown")}>
            {showTimings ? "Hide" : "Show"} timings on the wall
          </button>
          <button
            className={`${btn} text-memory`}
            disabled={!!busy}
            onClick={() => {
              if (window.confirm("Reset the demo? Files, chat and turns go back to the seed, and /toy and /home-base reload.")) {
                void run("reset", "/api/reset", undefined, () => "Demo reset. Toy and wall are reloading.");
              }
            }}
          >
            Reset demo
          </button>
        </div>
      </Card>

      <div role="status" aria-live="polite" className={`min-h-6 text-sm font-semibold ${status?.bad ? "text-memory" : "text-rules"}`}>
        {busy ? `Working on ${busy}...` : (status?.text ?? "")}
      </div>

      <Card title="Last 10 turns (ms)">
        {turns.length === 0 ? (
          <p className="text-sm text-muted">No turns yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left text-sm tabular-nums">
              <thead className="text-xs uppercase text-muted">
                <tr>
                  <th className="py-1 pr-3">Time</th>
                  <th className="pr-3">Kind</th>
                  <th className="pr-3">Aarav said</th>
                  <th className="pr-3 text-right">stt</th>
                  <th className="pr-3 text-right">brain 1st</th>
                  <th className="pr-3 text-right">voice 1st</th>
                  <th className="text-right">total</th>
                </tr>
              </thead>
              <tbody>
                {turns.map((t) => {
                  const said = t.child_text || (typeof t.meta?.text === "string" ? `(${t.meta.text})` : "");
                  return (
                    <tr key={t.id} className="border-t border-line">
                      <td className="py-1.5 pr-3 whitespace-nowrap">{turnTime(t.created_at)}</td>
                      <td className="pr-3">{t.kind}</td>
                      <td className="max-w-[14rem] truncate pr-3" title={said}>{said || "·"}</td>
                      <td className="pr-3 text-right">{ms(t.timings?.stt)}</td>
                      <td className="pr-3 text-right">{ms(t.timings?.brainFirst)}</td>
                      <td className="pr-3 text-right">{ms(t.timings?.voiceFirst)}</td>
                      <td className="text-right font-bold">{ms(t.timings?.total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </main>
  );
}
