"use client";
// R4.5 file strip: Nani's five files as chips with their version numbers, live from agent_files. A new version makes its
// chip pulse and shows a toast for about 4 s ("⏰ heartbeat.md v5 · Routine added: every 2 hours from 01:16"). A tap opens
// that agent's profile (R5); the 📈 chip opens the progress report (R7).
import { useEffect, useRef, useState } from "react";
import { openProfile } from "@/components/chat/profile";
import { openReport } from "@/components/report";
import { CHILD_ID } from "@/lib/config";
import { diffLines, removedLines } from "@/lib/files-pure";
import { parseJobLine } from "@/lib/jobs";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { BOTS, type BotKey, type FileName, type Job } from "@/lib/types";

const ORDER: BotKey[] = ["nani", "routine", "rules", "lessons", "memory"];
const TOAST_MS = 4200;
const PULSE_MS = 4200;

interface Row {
  name: FileName;
  version: number;
  content: string;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const noSeconds = (s: string) => s.replace(/\b(\d{2}:\d{2}):\d{2}\b/g, "$1");

/** "every 2 hours from 01:16", "daily at 20:30", "once on 19 Nov at 01:18 · call Mumma". */
function jobPhrase(j: Job): string {
  const w = j.when;
  const every = (n: number) => (n % 60 === 0 ? `every ${n / 60 === 1 ? "hour" : `${n / 60} hours`}` : `every ${n} minutes`);
  const when =
    w.kind === "daily"
      ? `daily at ${w.at}`
      : w.kind === "every"
        ? `${every(w.everyMinutes)} from ${w.from}${w.to ? ` to ${w.to}` : ""}`
        : `once${w.date ? ` on ${w.date}` : ""} at ${w.at}`;
  const what = j.action === "call" ? ` · call ${j.text}` : j.action === "song" ? " · the song" : j.action === "brief" ? " · the brief" : "";
  return noSeconds(when) + what;
}

function lineSummary(file: FileName, line: string): string {
  if (file === "heartbeat") {
    const j = parseJobLine(line);
    if (j) return jobPhrase(j);
  }
  // "- 19 Nov · Mumma: count in Hindi and English both" -> "count in Hindi and English both"
  return clip(line.replace(/^-\s*/, "").replace(/^\d{1,2} [A-Za-z]{3}\s*·\s*[^:]{1,24}:\s*/, ""), 56);
}

/** "Routine added: every 2 hours from 01:16". */
function changeSummary(bot: BotKey, file: FileName, before: string | undefined, after: string): string {
  const name = BOTS[bot].name;
  if (before === undefined) return `${name} updated it`;
  const added = diffLines(before, after);
  const removed = removedLines(before, after);
  const line = added[0] ?? removed[0];
  if (!line) return `${name} updated it`;
  const verb = added.length && removed.length ? "changed" : added.length ? "added" : "removed";
  return `${name} ${verb}: ${lineSummary(file, line)}`;
}

const botOf = (file: FileName): BotKey => ORDER.find((b) => BOTS[b].file === file)!;

export function FileStrip() {
  const [versions, setVersions] = useState<Partial<Record<FileName, number>>>({});
  const [pulse, setPulse] = useState<Partial<Record<FileName, number>>>({});
  const [toast, setToast] = useState<{ text: string; emoji: string; key: number } | null>(null);
  const contents = useRef<Partial<Record<FileName, string>>>({});
  const known = useRef<Partial<Record<FileName, number>>>({});

  useEffect(() => {
    const sb = supabaseBrowser();
    let dead = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const later = (f: () => void, ms: number) => {
      const id = setTimeout(() => {
        timers.delete(id);
        f();
      }, ms);
      timers.add(id);
    };

    const apply = (r: Row, live: boolean) => {
      const prev = known.current[r.name];
      if (prev !== undefined && r.version <= prev) return; // an older read, or a repeat
      const before = contents.current[r.name];
      known.current[r.name] = r.version;
      contents.current[r.name] = r.content;
      setVersions((v) => ({ ...v, [r.name]: r.version }));
      if (!live || prev === undefined) return;
      const bot = botOf(r.name);
      const key = Date.now();
      setPulse((p) => ({ ...p, [r.name]: key }));
      later(() => setPulse((p) => (p[r.name] === key ? { ...p, [r.name]: undefined } : p)), PULSE_MS);
      setToast({ emoji: BOTS[bot].emoji, text: `${r.name}.md v${r.version} · ${changeSummary(bot, r.name, before, r.content)}`, key });
      later(() => setToast((t) => (t?.key === key ? null : t)), TOAST_MS);
    };

    const files = ORDER.map((b) => BOTS[b].file);
    for (const name of files) {
      sb.from("agent_files")
        .select("name, version, content")
        .eq("child_id", CHILD_ID)
        .eq("name", name)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(({ data }) => {
          if (!dead && data) apply(data as Row, false);
        });
    }
    const ch = sb
      .channel(`stage-band:${CHILD_ID}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "agent_files", filter: `child_id=eq.${CHILD_ID}` }, (p) => {
        const r = p.new as Partial<Row>;
        if (r?.name && typeof r.version === "number" && files.includes(r.name)) apply({ name: r.name, version: r.version, content: r.content ?? "" }, true);
      })
      .subscribe();
    return () => {
      dead = true;
      for (const id of timers) clearTimeout(id);
      void sb.removeChannel(ch);
    };
  }, []);

  return (
    <div className="tb-strip" role="toolbar" aria-label="Nani's files">
      {ORDER.map((bot) => {
        const b = BOTS[bot];
        const v = versions[b.file];
        return (
          <button
            key={bot}
            type="button"
            className="tb-chip"
            data-bot={bot}
            data-pulse={pulse[b.file] ? "on" : undefined}
            onClick={() => openProfile(bot)}
            title={`${b.name}'s file: open the profile`}
          >
            <span className="tb-chip-emoji emoji" aria-hidden>
              {b.emoji}
            </span>
            <span className="tb-chip-name">
              {b.file}
              <span className="tb-chip-ext">.md</span>
            </span>
            <span className="tb-chip-v" key={pulse[b.file] ?? 0}>
              v{v ?? "·"}
            </span>
          </button>
        );
      })}
      <button type="button" className="tb-chip tb-chip-report" onClick={() => openReport()} title="Progress report" aria-label="Open the progress report">
        <span className="tb-chip-emoji emoji" aria-hidden>
          📈
        </span>
      </button>

      {toast && (
        <div key={toast.key} className="tb-toast" role="status" aria-live="polite">
          <span className="emoji" aria-hidden>
            {toast.emoji}
          </span>{" "}
          {toast.text}
        </div>
      )}
    </div>
  );
}
