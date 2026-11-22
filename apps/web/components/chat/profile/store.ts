"use client";
// A tiny module-level store: which agent's profile is open (null = none). Anyone can call openProfile().
import { useSyncExternalStore } from "react";
import type { BotKey } from "@/lib/types";

let current: BotKey | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function openProfile(bot: BotKey): void {
  if (current === bot) return;
  current = bot;
  emit();
}

export function closeProfile(): void {
  if (current === null) return;
  current = null;
  emit();
}

function subscribe(cb: () => void) {
  subs.add(cb);
  return () => {
    subs.delete(cb);
  };
}

export function useOpenProfile(): BotKey | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}
