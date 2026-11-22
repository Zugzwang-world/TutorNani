// Parent changes as Nani sees them (PLAN.md B7), and which of them her turns already reported (B8). Server-only.
//
// A "change" is a file version an agent wrote from the chat (changed_by is not "seed"). One parent message can
// change several files (mango news: planner.md + brain.md), so changes are grouped by their change note
// ("Mumma: I'm bringing mangoes for him tonight"). A group is reported once: the outcome note carries
// meta.forVersions ["planner@4", "brain@5"].
import { supabaseAdmin } from "../supabase/server";
import { BOT_OF_FILE, type BotKey, type FileName, type MessageMeta } from "../types";

/** How far back changes and notes are read. Reset clears both, so this only bounds a long day of testing. */
const WINDOW_MS = 16 * 3600_000;
/** The agent that reports a group: the first of its bots in this order. */
const REPORTER_ORDER: BotKey[] = ["rules", "lessons", "memory", "routine"];

export interface ChangeRow {
  name: FileName;
  version: number;
  changed_by: string | null;
  change_note: string | null;
  created_at: string;
}

export interface ChangeGroup {
  sender: string; // "Mumma"
  words: string; // "I'm bringing mangoes for him tonight"
  bots: BotKey[]; // owners of the changed files, reporter first
  versions: string[]; // ["planner@4", "brain@5"]
  at: string; // when the first file of the group changed
}

export interface Reported {
  versions: Set<string>; // "parent@3": already reported as followed
  events: Set<string>; // "jobKey@at": reminder answers already reported
  lastMomentAt: string | null; // the newest big-moment note
}

export const vkey = (name: FileName, version: number) => `${name}@${version}`;

const since = () => new Date(Date.now() - WINDOW_MS).toISOString();

/** Chat-made file versions in the window, oldest first (no content: small and fast). */
export async function loadChangeRows(child: string): Promise<ChangeRow[]> {
  const { data, error } = await supabaseAdmin()
    .from("agent_files")
    .select("name, version, changed_by, change_note, created_at")
    .eq("child_id", child)
    .neq("changed_by", "seed")
    .neq("name", "persona")
    .gte("created_at", since())
    .order("id", { ascending: true });
  if (error) throw new Error(`changes.rows: ${error.message}`);
  return data as ChangeRow[];
}

/** What outcome notes in the window already reported. */
export async function loadReported(child: string): Promise<Reported> {
  const { data, error } = await supabaseAdmin()
    .from("messages")
    .select("meta, created_at")
    .eq("child_id", child)
    .contains("meta", { kind: "note" })
    .gte("created_at", since())
    .order("id", { ascending: true });
  if (error) throw new Error(`changes.reported: ${error.message}`);
  const out: Reported = { versions: new Set(), events: new Set(), lastMomentAt: null };
  for (const m of data as { meta: MessageMeta; created_at: string }[]) {
    const fv = m.meta?.forVersions;
    if (Array.isArray(fv)) for (const v of fv) if (typeof v === "string") out.versions.add(v);
    if (typeof m.meta?.forEvent === "string") out.events.add(m.meta.forEvent);
    if (m.meta?.reason === "moment") out.lastMomentAt = m.created_at;
  }
  return out;
}

/** Groups rows by the parent message that caused them, oldest first. */
export function groupChanges(rows: ChangeRow[]): ChangeGroup[] {
  const map = new Map<string, ChangeGroup>();
  for (const r of rows) {
    const note = r.change_note?.trim() || `${r.changed_by ?? "someone"}: updated ${r.name}.md`;
    let g = map.get(note);
    if (!g) {
      const i = note.indexOf(": ");
      g = {
        sender: i > 0 ? note.slice(0, i) : "A parent",
        words: i > 0 ? note.slice(i + 2) : note,
        bots: [],
        versions: [],
        at: r.created_at,
      };
      map.set(note, g);
    }
    const bot = BOT_OF_FILE[r.name];
    if (!g.bots.includes(bot)) g.bots.push(bot);
    g.versions.push(vkey(r.name, r.version));
  }
  const groups = [...map.values()];
  for (const g of groups) g.bots.sort((a, b) => REPORTER_ORDER.indexOf(a) - REPORTER_ORDER.indexOf(b));
  return groups;
}

/** True if the group touched only Routine's jobs: the reminder itself is the follow-through, not Nani's play. */
export const routineOnly = (g: ChangeGroup) => g.bots.every((b) => b === "routine");

export const isReported = (g: ChangeGroup, r: Reported) => g.versions.some((v) => r.versions.has(v));

/** Keeps only versions this turn could see (version <= the one it used). */
export function seenBy(rows: ChangeRow[], used: Partial<Record<FileName, number>>): ChangeRow[] {
  return rows.filter((r) => r.version <= (used[r.name] ?? 0));
}

/** Versions newer than the previous talk turn used: "Changes since Aarav's last turn". */
export function newSince(rows: ChangeRow[], prevUsed: Partial<Record<FileName, number>> | null): ChangeRow[] {
  if (!prevUsed) return rows;
  return rows.filter((r) => r.version > (prevUsed[r.name] ?? 0));
}
