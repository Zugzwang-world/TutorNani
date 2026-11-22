"use client";
// "What changed" bottom sheet (for judges): the file's friendly name, that version with its new lines
// highlighted, who changed it and when, and the version list. Live on agent_files inserts.
import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { CHILD_ID } from "@/lib/config";
import { diffLines, removedLines } from "@/lib/files-pure";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { BOT_OF_FILE, BOTS, type AgentFile } from "@/lib/types";
import { BotAvatar } from "./avatar";
import type { WhatChangedTarget } from "./message-list";
import { botOf, uid, whenLabel } from "./ui";

function summary(added: number, removed: number, version: number): string {
  const parts: string[] = [];
  if (added) parts.push(`${added} new line${added > 1 ? "s" : ""}`);
  if (removed) parts.push(`${removed} removed`);
  if (parts.length) return `${parts.join(", ")} in v${version}`;
  return version === 1 ? "The first version" : `Nothing new to show in v${version}`;
}

/** One line of an agent file: heading, bullet or text; marked new (highlighted) or removed (struck through). */
export function FileLine({ text, mark, i = 0 }: { text: string; mark: "new" | "removed" | null; i?: number }) {
  if (text.startsWith("#") && mark !== "removed") {
    const h1 = /^#\s/.test(text);
    return <p className={`px-2 font-extrabold ${h1 ? "pt-1 text-[18px]" : "pt-2 text-[15px] text-ink/80"}`}>{text.replace(/^#+\s*/, "")}</p>;
  }
  const bullet = text.match(/^([-*]|\d+\.)\s+/);
  const isNew = mark === "new";
  const gone = mark === "removed";
  return (
    <div
      data-new={isNew}
      data-removed={gone}
      style={mark ? ({ "--i": i } as CSSProperties) : undefined}
      className={`tg-line relative my-0.5 flex gap-2 rounded-lg px-2 py-1 break-words ${
        isNew
          ? "bg-marigold-soft font-semibold before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-marigold"
          : gone
            ? "bg-[#fdecea] text-[#b42318] before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-[#e5484d]"
            : "text-ink/80"
      }`}
    >
      {bullet && (
        <span className={`shrink-0 ${isNew ? "text-[#b86a00]" : gone ? "text-[#b42318]/70" : "text-muted"}`}>
          {bullet[1].endsWith(".") ? bullet[1] : "•"}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className={gone ? "tg-strike text-[#b42318]" : ""}>{bullet ? text.slice(bullet[0].length) : text}</span>
        {(isNew || gone) && (
          <span
            className={`tg-badge ml-1.5 inline-block rounded-md px-1.5 py-px align-[2px] text-[10px] font-extrabold tracking-wide text-white uppercase no-underline ${
              gone ? "bg-[#e5484d]" : "bg-marigold"
            }`}
          >
            {gone ? "removed" : "new"}
          </span>
        )}
      </span>
    </div>
  );
}

function whoLabel(changedBy: string | null): string {
  if (!changedBy || changedBy === "seed") return "Starting version";
  const b = botOf(changedBy);
  return b ? `${b.emoji} ${b.name}` : changedBy;
}

export function WhatChangedSheet({ target, onClose }: { target: WhatChangedTarget; onClose: () => void }) {
  const bot = BOTS[BOT_OF_FILE[target.file]];
  const [label, fileName] = bot.fileLabel.split(" · ");
  const [versions, setVersions] = useState<AgentFile[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState<number>(target.toVersion);
  const [closing, setClosing] = useState(false);
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<number | null>(null);
  const body = useRef<HTMLDivElement | null>(null);
  const pills = useRef<HTMLDivElement | null>(null);

  // Load every version of this file, and stay live on new ones.
  useEffect(() => {
    let alive = true;
    const sb = supabaseBrowser();
    sb.from("agent_files")
      .select("*")
      .eq("child_id", CHILD_ID)
      .eq("name", target.file)
      .order("version", { ascending: true })
      .then(({ data, error }) => {
        if (!alive) return;
        if (error || !data) setFailed(true);
        else setVersions(data as AgentFile[]);
      });
    const ch = sb
      .channel(`files-sheet-${uid()}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "agent_files", filter: `child_id=eq.${CHILD_ID}` }, (p) => {
        const row = p.new as AgentFile;
        if (row.name !== target.file) return;
        setVersions((prev) => {
          const list = (prev ?? []).filter((v) => v.id !== row.id);
          return [...list, row].sort((a, b) => a.version - b.version);
        });
      })
      .subscribe();
    return () => {
      alive = false;
      void sb.removeChannel(ch);
    };
  }, [target.file]);

  const close = () => setClosing(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setClosing(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // If the asked-for version is gone (e.g. after a reset), show the latest.
  const current = useMemo(() => {
    if (!versions?.length) return null;
    return versions.find((v) => v.version === picked) ?? versions[versions.length - 1];
  }, [versions, picked]);

  const prev = useMemo(() => {
    if (!current || !versions) return null;
    return [...versions].reverse().find((v) => v.version < current.version) ?? null;
  }, [current, versions]);

  const highlighted = useMemo(() => {
    if (!current) return new Set<string>();
    if (current.version === target.toVersion && target.changedLines?.length) {
      return new Set(target.changedLines.map((l) => l.trim()).filter(Boolean));
    }
    return new Set(prev ? diffLines(prev.content, current.content) : []);
  }, [current, prev, target.toVersion, target.changedLines]);

  // Lines that were in the previous version and are gone now (e.g. a stopped reminder).
  const removed = useMemo(() => {
    if (!current) return [] as string[];
    if (current.version === target.toVersion && target.removedLines?.length) {
      return target.removedLines.map((l) => l.trim()).filter(Boolean);
    }
    return prev ? removedLines(prev.content, current.content) : [];
  }, [current, prev, target.toVersion, target.removedLines]);

  // Place each removed line where it used to be: after the last surviving line above it (-1 = top).
  const removedAt = useMemo(() => {
    const at = new Map<number, string[]>();
    if (!current || !removed.length) return at;
    const cur = current.content.replace(/\r\n/g, "\n").split("\n").map((l) => l.trim());
    const rest = new Set(removed);
    let last = -1;
    for (const raw of prev ? prev.content.replace(/\r\n/g, "\n").split("\n") : []) {
      const l = raw.trim();
      if (!l) continue;
      if (rest.has(l)) {
        at.set(last, [...(at.get(last) ?? []), l]);
        rest.delete(l);
      } else {
        const j = cur.indexOf(l, last + 1);
        if (j >= 0) last = j;
      }
    }
    if (rest.size) at.set(cur.length - 1, [...(at.get(cur.length - 1) ?? []), ...rest]);
    return at;
  }, [current, prev, removed]);

  // Bring the first change into view, and the picked version pill.
  useLayoutEffect(() => {
    const el = body.current?.querySelector<HTMLElement>("[data-new='true'], [data-removed='true']");
    if (el && body.current) body.current.scrollTop = Math.max(0, el.offsetTop - 72);
    else if (body.current) body.current.scrollTop = 0;
    pills.current?.querySelector<HTMLElement>("[data-picked='true']")?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [current?.id]);

  // The line highlights wait for the sheet to finish sliding in; after that, switching versions replays them at once.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSettled(true), 400);
    return () => clearTimeout(t);
  }, []);

  // Drag the handle down to dismiss: far enough, or a quick flick. Pulling up resists.
  const flick = useRef<{ y: number; t: number; v: number }>({ y: 0, t: 0, v: 0 });
  const onDragStart = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragStart.current = e.clientY;
    flick.current = { y: e.clientY, t: e.timeStamp, v: 0 };
    setDragging(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };
  const onDragMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragStart.current == null) return;
    const dy = e.clientY - dragStart.current;
    setDrag(dy >= 0 ? dy : -Math.min(14, Math.sqrt(-dy) * 1.6));
    const f = flick.current;
    const dt = e.timeStamp - f.t;
    if (dt > 0) flick.current = { y: e.clientY, t: e.timeStamp, v: (e.clientY - f.y) / dt };
  };
  const onDragEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragStart.current == null) return;
    dragStart.current = null;
    setDragging(false);
    const fresh = e.timeStamp - flick.current.t < 100;
    if (drag > 110 || (drag > 24 && fresh && flick.current.v > 0.5)) setClosing(true);
    else setDrag(0);
  };

  const lines = current ? current.content.replace(/\r\n/g, "\n").split("\n") : [];
  const latest = versions?.length ? versions[versions.length - 1].version : null;
  const newCount = lines.filter((l) => highlighted.has(l.trim()) && !l.trim().startsWith("#")).length;
  let nth = 0; // order of the marked lines, for the staggered highlight
  const fade = Math.max(0.15, 1 - drag / 420); // the backdrop lightens as the sheet is pulled down

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={`What changed in ${label}`}>
      <div
        className="tg-backdrop absolute inset-0 bg-ink/35"
        data-closing={closing}
        style={{ opacity: fade, transition: dragging ? undefined : "opacity 260ms ease" }}
        onClick={close}
        onAnimationEnd={() => {
          if (closing) onClose();
        }}
      />
      <div
        className="tg-sheet relative flex max-h-[88dvh] w-full max-w-[640px] flex-col rounded-t-[28px] bg-cream shadow-[0_-8px_40px_rgba(43,33,24,0.18)]"
        data-closing={closing}
        style={
          {
            transform: !closing && drag ? `translateY(${drag}px)` : undefined,
            transition: !dragging && !closing ? "transform 260ms cubic-bezier(0.32,0.72,0,1)" : undefined,
            "--tg-drag": `${drag}px`,
          } as CSSProperties
        }
      >
        {/* handle + header (drag area) */}
        <div className="cursor-grab touch-none px-5 pt-2.5 pb-3 select-none" onPointerDown={onDragStart} onPointerMove={onDragMove} onPointerUp={onDragEnd} onPointerCancel={onDragEnd}>
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-ink/15" />
          <div className="flex items-center gap-3">
            <BotAvatar bot={bot} size={40} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[18px] leading-tight font-extrabold">{label}</p>
              <p className="mt-0.5 font-mono text-[13px] text-muted">{fileName}</p>
            </div>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={close}
              aria-label="Close"
              className="tg-press flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-line/70 text-ink/70"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        {/* who + when */}
        {current && (
          <div className="mx-5 mb-3 rounded-2xl border border-line bg-paper px-3.5 py-2.5">
            <p className="text-[15px] leading-snug">
              <span className="font-extrabold">{whoLabel(current.changed_by)}</span>
              <span className="text-muted"> · {whenLabel(current.created_at)}</span>
            </p>
            {current.change_note && <p className="mt-0.5 text-[15px] leading-snug text-ink/75">“{current.change_note}”</p>}
          </div>
        )}

        {/* versions */}
        <div ref={pills} className="tg-noscrollbar flex shrink-0 gap-2 overflow-x-auto px-5 pb-3">
          {(versions ?? []).map((v) => {
            const on = current?.id === v.id;
            return (
              <button
                key={v.id}
                type="button"
                data-picked={on}
                onClick={() => setPicked(v.version)}
                className={`tg-press shrink-0 rounded-full border px-3.5 py-1.5 text-[14px] font-extrabold whitespace-nowrap transition-colors ${
                  on ? "border-marigold bg-marigold text-white" : "border-line bg-paper text-ink/75"
                }`}
              >
                v{v.version}
                {v.version === latest && <span className={on ? "text-white/85" : "text-muted"}> · now</span>}
              </button>
            );
          })}
        </div>

        {/* content */}
        <div ref={body} className="relative min-h-[140px] flex-1 overflow-y-auto overscroll-contain border-t border-line bg-paper px-3 pt-3 pb-[max(20px,env(safe-area-inset-bottom))]">
          {!versions && !failed && <p className="px-2 py-6 text-center text-muted">Opening the file…</p>}
          {failed && <p className="px-2 py-6 text-center text-muted">Couldn&apos;t open the file right now.</p>}
          {current && (
            <>
              <p className="mb-2 px-2 text-[13px] font-bold text-muted">{summary(newCount, removed.length, current.version)}</p>
              <div key={current.id} className="text-base leading-[1.45]" style={{ "--tg-base": settled ? "60ms" : "320ms" } as CSSProperties}>
                {(removedAt.get(-1) ?? []).map((r, k) => (
                  <FileLine key={`r-top-${k}`} text={r} mark="removed" i={nth++} />
                ))}
                {lines.map((raw, i) => {
                  const l = raw.trim();
                  const gone = (removedAt.get(i) ?? []).map((r, k) => <FileLine key={`r${i}-${k}`} text={r} mark="removed" i={nth++} />);
                  if (!l)
                    return (
                      <Fragment key={i}>
                        <div className="h-2" />
                        {gone}
                      </Fragment>
                    );
                  const isNew = highlighted.has(l) && !l.startsWith("#");
                  return (
                    <Fragment key={i}>
                      <FileLine text={l} mark={isNew ? "new" : null} i={isNew ? nth++ : 0} />
                      {gone}
                    </Fragment>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
