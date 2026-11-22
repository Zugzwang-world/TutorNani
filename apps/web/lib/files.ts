// The five agent files, versioned in Supabase (server-only). PLAN.md B6, B9.
import { supabaseAdmin } from "./supabase/server";
import { FILE_NAMES, type AgentFile, type FileName } from "./types";
import { diffLines, removedLines, replaceSectionText } from "./files-pure";

export { getSection, sectionLines, replaceSectionText, diffLines, removedLines } from "./files-pure";

export async function getLatest(child: string, name: FileName): Promise<AgentFile> {
  const { data, error } = await supabaseAdmin()
    .from("agent_files")
    .select("*")
    .eq("child_id", child)
    .eq("name", name)
    .order("version", { ascending: false })
    .limit(1)
    .single();
  if (error) throw new Error(`files.getLatest(${name}): ${error.message}`);
  return data as AgentFile;
}

/** Latest version of all five files. One query; no caching across calls. */
export async function getAllLatest(child: string): Promise<Record<FileName, AgentFile>> {
  const { data, error } = await supabaseAdmin()
    .from("agent_files")
    .select("*")
    .eq("child_id", child)
    .order("version", { ascending: false });
  if (error) throw new Error(`files.getAllLatest: ${error.message}`);
  const out = {} as Record<FileName, AgentFile>;
  for (const row of data as AgentFile[]) if (!out[row.name]) out[row.name] = row;
  for (const n of FILE_NAMES) if (!out[n]) throw new Error(`files.getAllLatest: ${n} missing (run /api/reset?)`);
  return out;
}

/** All versions of one file, newest first. */
export async function getHistory(child: string, name: FileName): Promise<AgentFile[]> {
  const { data, error } = await supabaseAdmin()
    .from("agent_files")
    .select("*")
    .eq("child_id", child)
    .eq("name", name)
    .order("version", { ascending: false });
  if (error) throw new Error(`files.getHistory(${name}): ${error.message}`);
  return data as AgentFile[];
}

/** File versions created after `sinceIso` (oldest first), excluding seed rows. For "Changes since Aarav's last turn". */
export async function getChangesSince(child: string, sinceIso: string): Promise<AgentFile[]> {
  const { data, error } = await supabaseAdmin()
    .from("agent_files")
    .select("*")
    .eq("child_id", child)
    .gt("created_at", sinceIso)
    .neq("changed_by", "seed")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`files.getChangesSince: ${error.message}`);
  return data as AgentFile[];
}

// ---------- Writes ----------

export interface WriteResult {
  file: AgentFile; // the new latest row (or the old one if nothing changed)
  fromVersion: number;
  toVersion: number;
  changedLines: string[]; // new or changed lines
  removedLines: string[];
  changed: boolean;
}

/** Store a full new version of a file. Retries once on a version clash. */
export async function writeFile(
  child: string,
  name: FileName,
  content: string,
  by: string,
  note: string | null,
): Promise<WriteResult> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const cur = await getLatest(child, name);
    if (cur.content === content) {
      return { file: cur, fromVersion: cur.version, toVersion: cur.version, changedLines: [], removedLines: [], changed: false };
    }
    const { data, error } = await supabaseAdmin()
      .from("agent_files")
      .insert({ child_id: child, name, version: cur.version + 1, content, changed_by: by, change_note: note })
      .select()
      .single();
    if (!error) {
      return {
        file: data as AgentFile,
        fromVersion: cur.version,
        toVersion: cur.version + 1,
        changedLines: diffLines(cur.content, content),
        removedLines: removedLines(cur.content, content),
        changed: true,
      };
    }
    if (!/duplicate|unique/i.test(error.message) || attempt === 1) throw new Error(`files.writeFile(${name}): ${error.message}`);
  }
  throw new Error("unreachable");
}

/** Replace one section of a file and store it as a new version. PLAN.md A8. */
export async function replaceSection(
  child: string,
  name: FileName,
  heading: string,
  newSectionText: string,
  by: string,
  note: string,
): Promise<WriteResult> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const cur = await getLatest(child, name);
    const next = replaceSectionText(cur.content, heading, newSectionText);
    try {
      if (next === cur.content) {
        return { file: cur, fromVersion: cur.version, toVersion: cur.version, changedLines: [], removedLines: [], changed: false };
      }
      const { data, error } = await supabaseAdmin()
        .from("agent_files")
        .insert({ child_id: child, name, version: cur.version + 1, content: next, changed_by: by, change_note: note })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return {
        file: data as AgentFile,
        fromVersion: cur.version,
        toVersion: cur.version + 1,
        changedLines: diffLines(cur.content, next),
        removedLines: removedLines(cur.content, next),
        changed: true,
      };
    } catch (e) {
      const msg = (e as Error).message;
      if (!/duplicate|unique/i.test(msg) || attempt === 1) throw new Error(`files.replaceSection(${name}): ${msg}`);
    }
  }
  throw new Error("unreachable");
}
