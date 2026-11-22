// Pure markdown section helpers for the agent files. Safe on client and server.

function normHeading(h: string): string {
  const t = h.trim();
  return t.startsWith("#") ? t : `## ${t}`;
}

/** Returns [start, end) line indexes of the section that starts at `heading`, or null. */
function findSection(lines: string[], heading: string): [number, number] | null {
  const h = normHeading(heading).toLowerCase();
  const level = h.match(/^#+/)![0].length;
  const start = lines.findIndex((l) => l.trim().toLowerCase() === h);
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#+)\s/);
    if (m && m[1].length <= level) {
      end = i;
      break;
    }
  }
  return [start, end];
}

/** The text of one section, including its heading line. Empty string if missing. */
export function getSection(content: string, heading: string): string {
  const lines = content.split("\n");
  const r = findSection(lines, heading);
  return r ? lines.slice(r[0], r[1]).join("\n").trimEnd() : "";
}

/** The body lines of a section (without the heading), trimmed, non-empty. */
export function sectionLines(content: string, heading: string): string[] {
  return getSection(content, heading)
    .split("\n")
    .slice(1)
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Pure: replace (or append) one section. `newSectionText` may include or omit the heading line. */
export function replaceSectionText(content: string, heading: string, newSectionText: string): string {
  const h = normHeading(heading);
  let body = newSectionText.replace(/\r\n/g, "\n").trim();
  const first = body.split("\n")[0]?.trim().toLowerCase();
  if (first === h.toLowerCase()) body = body.split("\n").slice(1).join("\n").trim();
  const block = body ? `${h}\n${body}` : h;

  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const r = findSection(lines, h);
  let out: string[];
  if (r) {
    const after = lines.slice(r[1]);
    out = [...lines.slice(0, r[0]), ...block.split("\n"), ...(after.length ? ["", ...after] : [])];
  } else {
    out = [...lines.join("\n").trimEnd().split("\n"), "", ...block.split("\n")];
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

/** Lines present in `after` but not in `before` (trimmed, non-empty, headings skipped). */
export function diffLines(before: string, after: string): string[] {
  const old = new Set(before.split("\n").map((l) => l.trim()).filter(Boolean));
  return after
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !old.has(l) && !l.startsWith("#"));
}

/** Lines present in `before` but gone from `after` (e.g. a removed job). */
export function removedLines(before: string, after: string): string[] {
  return diffLines(after, before);
}
