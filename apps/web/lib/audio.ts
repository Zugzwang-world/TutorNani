// Pre-made audio manifest (content/audio.json, written by S1). Safe on client and server.
import manifest from "../../../content/audio.json";
import type { AudioEntry, AudioKind } from "./types";

export const AUDIO: AudioEntry[] = manifest as unknown as AudioEntry[];

export function audioById(id: string): AudioEntry | undefined {
  return AUDIO.find((a) => a.id === id);
}

export function audioByKind(kind: AudioKind, area?: string): AudioEntry[] {
  return AUDIO.filter((a) => a.kind === kind && (area === undefined || a.area === area));
}
