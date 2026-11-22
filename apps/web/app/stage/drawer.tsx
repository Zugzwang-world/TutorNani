"use client";
// The stage's hidden presenter drawer (R1): Reset (with the warm-up), the demo clock, the next job, the evening
// brief, the wall's timings and the last turns. Every action goes through the same API calls as /presenter, so the
// broadcasts come from the server and reach every page, this one included.
import { useCallback, useEffect, useRef, useState } from "react";
import { clockParts, demoNow } from "@/lib/clock";
import { CHILD_ID } from "@/lib/config";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { Turn } from "@/lib/types";
import "./stage.css";

const MIN = 60_000;
/** Set just before POST /api/reset: the page reloads on the reset broadcast, which can kill the fetch. */
const RESET_KEY = "tg_stage_reset_at";
const RESET_FRESH_MS = 60_000;

export type Notify = (text: string, opts?: { bad?: boolean; ms?: number }) => void;

async function postJson(url: string, body?: unknown): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const res = await fetch(url, {
    method: "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok && data.ok !== false, status: res.status, data };
}

const readFlag = (): number => {
  try {
    return Number(sessionStorage.getItem(RESET_KEY) || 0);
  } catch {
    return 0;
  }
};
const writeFlag = (v: number | null) => {
  try {
    if (v === null) sessionStorage.removeItem(RESET_KEY);
    else sessionStorage.setItem(RESET_KEY, String(v));
  } catch {}
};

/** The presenter's state and actions. Mounted once per stage, so the shortcuts work with the drawer closed. */
export function usePresenter(notify: Notify) {
  const [offsetMs, setOffsetMs] = useState(0);
  const [showTimings, setShowTimings] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const busyRef = useRef<string | null>(null);

  const applyState = useCallback((st: { clock_offset_ms?: number; show_timings?: boolean } | null | undefined) => {
    if (!st) return;
    if (typeof st.clock_offset_ms === "number") setOffsetMs(st.clock_offset_ms);
    if (typeof st.show_timings === "boolean") setShowTimings(st.show_timings);
  }, []);

  // After a reset's reload: "Ready" if the flag is fresh. Clear it either way.
  useEffect(() => {
    const at = readFlag();
    if (!at) return;
    writeFlag(null);
    if (Date.now() - at < RESET_FRESH_MS) notify("Ready ✓", { ms: 6000 });
  }, [notify]);

  // Live: demo_state and the last 10 turns.
  useEffect(() => {
    const sb = supabaseBrowser();
    const filter = `child_id=eq.${CHILD_ID}`;
    const loadTurns = () =>
      sb
        .from("turns")
        .select("*")
        .eq("child_id", CHILD_ID)
        .order("id", { ascending: false })
        .limit(10)
        .then(({ data }) => setTurns((data as Turn[]) ?? []));
    sb.from("demo_state").select("clock_offset_ms, show_timings").eq("child_id", CHILD_ID).maybeSingle().then(({ data }) => applyState(data));
    void loadTurns();
    const ch = sb
      .channel(`stage-presenter:${CHILD_ID}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "demo_state", filter }, (p) => applyState(p.new as { clock_offset_ms?: number }))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "turns", filter }, (p) => {
        const t = p.new as Turn;
        setTurns((cur) => [t, ...cur.filter((x) => x.id !== t.id)].slice(0, 10));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "turns", filter }, (p) => {
        const t = p.new as Turn;
        setTurns((cur) => cur.map((x) => (x.id === t.id ? { ...x, ...t } : x)));
      })
      .subscribe();
    return () => {
      void sb.removeChannel(ch);
    };
  }, [applyState]);

  const run = useCallback(
    async (key: string, url: string, body: unknown, done: string) => {
      if (busyRef.current) return;
      busyRef.current = key;
      setBusy(key);
      const t0 = performance.now();
      try {
        const r = await postJson(url, body);
        if (r.status === 404 && url === "/api/brief") notify("The evening brief is not built yet", { bad: true });
        else if (!r.ok) notify(`${key} failed: ${String(r.data.error ?? r.status)}`, { bad: true });
        else {
          applyState(r.data.state as { clock_offset_ms?: number; show_timings?: boolean } | undefined);
          notify(done);
        }
        console.log(`[stage] ${key} ${r.status} in ${Math.round(performance.now() - t0)} ms`);
      } catch (e) {
        notify(`${key} failed: ${(e as Error).message}`, { bad: true });
      } finally {
        busyRef.current = null;
        setBusy(null);
      }
    },
    [applyState, notify],
  );

  const reset = useCallback(async () => {
    if (busyRef.current === "reset") return;
    busyRef.current = "reset";
    setBusy("reset");
    writeFlag(Date.now());
    notify("Resetting… seed, warm-up, then the stage reloads", { ms: 60_000 });
    const t0 = performance.now();
    try {
      const r = await postJson("/api/reset");
      console.log(`[stage] reset ${r.status} in ${Math.round(performance.now() - t0)} ms`, r.data.warm ?? "");
      if (r.ok && r.data.ready) {
        // The fetch won the race: the reload follows (the post-reload check clears the flag).
        notify("Ready ✓", { ms: 6000 });
        setTimeout(() => writeFlag(null), 15_000); // no reload came (broadcast lost): don't leave a stale flag
      } else {
        writeFlag(null);
        notify(`Reset failed: ${String(r.data.error ?? r.status)}`, { bad: true });
      }
    } catch (e) {
      // Usually the reload killed the fetch. If this page is still here in 4 s, it really failed.
      setTimeout(() => {
        writeFlag(null);
        notify(`Reset failed: ${(e as Error).message}`, { bad: true });
      }, 4000);
    } finally {
      busyRef.current = null;
      setBusy(null);
    }
  }, [notify]);

  const actions = {
    add30: () => run("+30 min", "/api/presenter", { action: "clock", addMs: 30 * MIN }, "Clock +30 min"),
    add2h: () => run("+2 h", "/api/presenter", { action: "clock", addMs: 120 * MIN }, "Clock +2 h"),
    real: () => run("Real time", "/api/presenter", { action: "real" }, "Clock back to real time"),
    fireNext: () => run("Fire next job", "/api/presenter", { action: "fire_next" }, "Firing the next job"),
    brief: () => run("Evening brief", "/api/brief", {}, "Evening brief sent: watch the chat"),
    timings: () => run("Timings", "/api/presenter", { action: "timings", show: !showTimings }, showTimings ? "Timings hidden" : "Timings shown"),
    reset,
  };

  return { offsetMs, showTimings, turns, busy, actions };
}

export type Presenter = ReturnType<typeof usePresenter>;

const ms = (n: unknown) => (typeof n === "number" ? Math.round(n).toString() : "·");
const turnTime = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(
    new Date(iso),
  );

function Clock({ offsetMs }: { offsetMs: number }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(demoNow(offsetMs));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [offsetMs]);
  const parts = now ? clockParts(now) : null;
  const shift = Math.round(offsetMs / MIN);
  return (
    <div className="stg-dr-clock">
      <b className="tabular-nums">{parts ? `${parts.hhmm}:${String(now!.getUTCSeconds()).padStart(2, "0")}` : "--:--:--"}</b>
      <span>
        {parts?.label ?? ""} · {shift === 0 ? "real time" : `${shift > 0 ? "+" : ""}${shift} min`}
      </span>
    </div>
  );
}

export function PresenterDrawer({ p, open, onClose }: { p: Presenter; open: boolean; onClose: () => void }) {
  const [armed, setArmed] = useState(false); // Reset asks for a second tap
  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(id);
  }, [armed]);
  if (!open) return null;
  const { actions: a, busy } = p;
  const dis = !!busy;

  return (
    <aside className="stg-drawer" aria-label="Presenter">
      <header className="stg-dr-head">
        <h2>Presenter</h2>
        <button type="button" className="stg-dr-close" onClick={onClose} aria-label="Close the presenter drawer">
          ✕
        </button>
      </header>

      <Clock offsetMs={p.offsetMs} />
      <div className="stg-dr-row">
        <button type="button" className="stg-dr-btn" disabled={dis} onClick={a.add30}>
          +30 min
        </button>
        <button type="button" className="stg-dr-btn" disabled={dis} onClick={a.add2h}>
          +2 h <kbd>⌥2</kbd>
        </button>
        <button type="button" className="stg-dr-btn" disabled={dis} onClick={a.real}>
          Real time
        </button>
      </div>
      <div className="stg-dr-row">
        <button type="button" className={`stg-dr-btn stg-dr-primary`} disabled={dis} onClick={a.fireNext}>
          Fire next job <kbd>⌥F</kbd>
        </button>
        <button type="button" className={`stg-dr-btn stg-dr-primary`} disabled={dis} onClick={a.brief}>
          Evening brief
        </button>
      </div>
      <div className="stg-dr-row">
        <button type="button" className="stg-dr-btn" disabled={dis} onClick={a.timings}>
          {p.showTimings ? "Hide" : "Show"} timings
        </button>
        <button
          type="button"
          className={`stg-dr-btn stg-dr-danger`}
          disabled={dis}
          data-armed={armed}
          onClick={() => {
            if (!armed) return setArmed(true);
            setArmed(false);
            void a.reset();
          }}
        >
          {busy === "reset" ? "Resetting…" : armed ? "Tap again to reset" : "Reset"} <kbd>⌥R</kbd>
        </button>
      </div>
      <p className="stg-dr-hint">
        Space or the paw: tap to talk, tap to send · <kbd>⌥P</kbd> this drawer
      </p>

      <h3 className="stg-dr-sub">Last 10 turns (ms)</h3>
      {p.turns.length === 0 ? (
        <p className="stg-dr-hint">No turns yet.</p>
      ) : (
        <div className="stg-dr-table">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Kind</th>
                <th>Aarav said</th>
                <th>stt</th>
                <th>brain</th>
                <th>voice</th>
                <th>total</th>
              </tr>
            </thead>
            <tbody>
              {p.turns.map((t) => {
                const said = t.child_text || (typeof t.meta?.text === "string" ? `(${t.meta.text})` : "");
                return (
                  <tr key={t.id}>
                    <td>{turnTime(t.created_at)}</td>
                    <td>{t.kind}</td>
                    <td className="stg-dr-said" title={said}>
                      {said || "·"}
                    </td>
                    <td>{ms(t.timings?.stt)}</td>
                    <td>{ms(t.timings?.brainFirst)}</td>
                    <td>{ms(t.timings?.voiceFirst)}</td>
                    <td>
                      <b>{ms(t.timings?.total)}</b>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </aside>
  );
}
