// Which child a page or request is for (TOUR brief, A). The default child is CHILD_ID ("aarav"); a judge's tour
// runs in its own sandbox child "t-" + 6 lowercase letters or digits. Anything else falls back to CHILD_ID.
// Pure; client-safe. Contracts: docs/plan/CONTRACTS.md "Tour contracts".
import { CHILD_ID } from "./config";

export const CHILD_RE = /^(aarav|t-[a-z0-9]{6})$/;

export function isChildId(v: unknown): v is string {
  return typeof v === "string" && CHILD_RE.test(v);
}

/** A valid child id, or CHILD_ID. */
export function cleanChild(v: unknown): string {
  return isChildId(v) ? v : CHILD_ID;
}

/** `?child=` on a URL (a page's location or an API request), or CHILD_ID. */
export function childFromUrl(url: string | URL): string {
  try {
    return cleanChild(new URL(url, "http://x").searchParams.get("child"));
  } catch {
    return CHILD_ID;
  }
}

/** A fresh sandbox id: "t-" + 6 lowercase letters or digits. */
export function newSandboxId(): string {
  const abc = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return "t-" + Array.from(bytes, (b) => abc[b % abc.length]).join("");
}
