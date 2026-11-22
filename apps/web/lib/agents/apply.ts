// Guards and applies one agent's edit to its own file (PLAN.md B5 step 4, B6, D5). Server-only.
import { getLatest, sectionLines, type WriteResult } from "../files";
import { diffLines, removedLines, replaceSectionText } from "../files-pure";
import { supabaseAdmin } from "../supabase/server";
import { parseJobLine, parseJobs } from "../jobs";
import { BOTS, type AgentFile, type BotKey, type FileName } from "../types";

/** The file's "## " headings, exactly as written. */
export function headingsOf(content: string): string[] {
  return content
    .split("\n")
    .filter((l) => /^##\s+\S/.test(l))
    .map((l) => l.trim());
}

const norm = (h: string): string => h.replace(/^#+/, "").trim().toLowerCase();
/** Line identity for matching removals: no bullet, no case, single spaces. */
const key = (l: string): string => l.trim().replace(/^[-*]\s*/, "").replace(/\s+/g, " ").toLowerCase();

export interface SorterEdit {
  section: string;
  add?: string[];
  remove?: string[];
  newSection?: string;
}

export interface GuardedEdit {
  file: FileName;
  heading: string; // the file's own heading string
  newSection: string; // heading + cleaned body
}

/** Body lines from a full newSection: optional heading first, cut at any other heading, no blanks. */
function linesFromNewSection(text: string, heading: string): string[] | null {
  let lines = text.replace(/\r\n/g, "\n").split("\n").map((l) => l.trimEnd());
  while (lines.length && !lines[0].trim()) lines.shift();
  if (lines.length && /^#/.test(lines[0].trim())) {
    if (norm(lines[0]) !== norm(heading)) return null;
    lines.shift();
  }
  const cut = lines.findIndex((l) => /^#/.test(l.trim()));
  if (cut >= 0) lines = lines.slice(0, cut);
  return lines.filter((l) => l.trim());
}

/** Body lines after removing `remove` (exact, then a single unambiguous partial match) and appending `add`. */
function linesFromDiff(current: string[], add: string[], remove: string[], bot: BotKey): string[] {
  const out = [...current];
  for (const r of remove) {
    const k = key(r);
    if (!k) continue;
    let i = out.findIndex((l) => key(l) === k);
    if (i < 0) {
      const partial = out.map((l, j) => (key(l).includes(k) || k.includes(key(l)) ? j : -1)).filter((j) => j >= 0);
      if (partial.length === 1) i = partial[0];
    }
    if (i >= 0) out.splice(i, 1);
    else console.warn(`[chat] ${bot}: no line to remove matching "${r}"`);
  }
  for (const a of add) {
    const line = a.replace(/\s+$/, "");
    if (!line.trim() || /^#/.test(line.trim())) continue;
    const bullet = /^\s*([-*]|\d+\.)\s/.test(line) ? line.trim() : `- ${line.trim()}`;
    if (!out.some((l) => key(l) === key(bullet))) out.push(bullet);
  }
  return out;
}

/**
 * Checks an edit against the rules. Returns the cleaned edit, or null (with a logged reason) to drop it:
 * - Nani never edits; a bot edits only its own file.
 * - The section must be one of that file's existing "## " headings.
 * - The new body never carries other headings.
 * - heartbeat.md keeps only valid job lines (D5).
 */
export function guardEdit(bot: BotKey, edit: SorterEdit | null | undefined, files: Record<FileName, AgentFile>): GuardedEdit | null {
  if (!edit) return null;
  const file = BOTS[bot].file;
  if (bot === "nani" || file === "persona") return drop(bot, "nani never edits");

  const cur = files[file].content;
  const heading = headingsOf(cur).find((h) => norm(h) === norm(edit.section));
  if (!heading) return drop(bot, `no section "${edit.section}" in ${file}.md`);

  const current = sectionLines(cur, heading);
  let lines: string[] | null;
  if (edit.add?.length || edit.remove?.length) lines = linesFromDiff(current, edit.add ?? [], edit.remove ?? [], bot);
  else if (typeof edit.newSection === "string") lines = linesFromNewSection(edit.newSection, heading);
  else return drop(bot, "empty edit");
  if (!lines) return drop(bot, `newSection does not start with ${heading}`);

  if (file === "heartbeat") {
    const ok = lines.filter((l) => parseJobLine(l));
    for (const l of lines) if (!ok.includes(l)) console.warn(`[chat] dropped job line: ${l}`);
    if (!ok.length && parseJobs(cur).length && !edit.remove?.length) return drop(bot, "no valid job lines left");
    lines = ok.map((l) => l.trim());
  }

  return { file, heading, newSection: [heading, ...lines].join("\n") };
}

function drop(bot: BotKey, why: string): null {
  console.warn(`[chat] ${bot} edit dropped: ${why}`);
  return null;
}

/** "Mumma: remind him to drink water every 2 hours". What Nani sees under "Changes since Aarav's last turn". */
export function changeNote(sender: string, text: string): string {
  let t = text.replace(/\s+/g, " ").trim(); // case kept, so names like Riya stay right
  if (t.length > 120) t = `${t.slice(0, 117).trimEnd()}…`;
  return `${sender}: ${t}`;
}

/**
 * Applies an edit to the file as it is RIGHT NOW: re-reads the latest version, re-runs guardEdit on it,
 * and inserts version+1. If another write took that version first (unique clash), it retries from the
 * fresh file, so two quick edits to the same file never overwrite each other (works across instances).
 */
export async function applyEdit(child: string, bot: BotKey, edit: SorterEdit, note: string): Promise<WriteResult | null> {
  const file = BOTS[bot].file;
  for (let attempt = 0; attempt < 4; attempt++) {
    const cur = await getLatest(child, file);
    const g = guardEdit(bot, edit, { [file]: cur } as Record<FileName, AgentFile>);
    if (!g) return null;
    const next = replaceSectionText(cur.content, g.heading, g.newSection);
    if (next === cur.content) {
      return { file: cur, fromVersion: cur.version, toVersion: cur.version, changedLines: [], removedLines: [], changed: false };
    }
    const { data, error } = await supabaseAdmin()
      .from("agent_files")
      .insert({ child_id: child, name: file, version: cur.version + 1, content: next, changed_by: bot, change_note: note })
      .select()
      .single();
    if (!error) {
      return {
        file: data as AgentFile,
        fromVersion: cur.version,
        toVersion: cur.version + 1,
        changedLines: diffLines(cur.content, next),
        removedLines: removedLines(cur.content, next),
        changed: true,
      };
    }
    if (!/duplicate|unique/i.test(error.message)) throw new Error(`applyEdit(${file}): ${error.message}`);
    await new Promise((r) => setTimeout(r, 40 + Math.random() * 160));
  }
  throw new Error(`applyEdit(${file}): version clash, gave up`);
}
