// Call with Mumma (PLAN.md C11, N2): names and limits shared by the toy, the chat and the API routes.
export type CallWho = "mumma" | "papa";
export type CallState = "ringing" | "open" | "ended";
export type CallFrom = "toy" | "parent";

/** A call ends after this long with no clip either way (counted from ringing, too). */
export const CALL_IDLE_MS = 120_000;
/** Shorter holds are accidental taps: nothing is sent. */
export const MIN_CLIP_MS = 300;
/** A hold longer than this is cut and sent (keeps clips small). */
export const MAX_CLIP_MS = 30_000;

export const asWho = (w: unknown): CallWho => (w === "papa" ? "papa" : "mumma");
export const whoLabel = (w: unknown): string => (asWho(w) === "papa" ? "Papa" : "Mumma");

export const isCallId = (id: unknown): id is string => typeof id === "string" && /^[\w-]{8,64}$/.test(id);

/** Clip urls end in clips/<callId>/<ms since epoch>.<ext>: the send time, for end-to-end timing logs. */
export function sentAtOf(url: string): number | null {
  const m = url.match(/\/(\d{12,})\.\w+(?:\?|$)/);
  return m ? Number(m[1]) : null;
}
