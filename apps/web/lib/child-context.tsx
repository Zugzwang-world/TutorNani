"use client";
// The child a client tree is for (TOUR brief, A). <Stage child=…> (and the other pages, from `?child=`) wrap their
// tree in <ChildProvider>; any hook below reads it with useChild(). Without a provider: CHILD_ID, so every page
// behaves exactly as before. Contracts: docs/plan/CONTRACTS.md "Tour contracts".
import { createContext, useContext, type ReactNode } from "react";
import { CHILD_ID } from "./config";
import { cleanChild } from "./child";

const ChildContext = createContext<string>(CHILD_ID);

export function ChildProvider({ child, children }: { child?: string | null; children: ReactNode }) {
  return <ChildContext.Provider value={cleanChild(child)}>{children}</ChildContext.Provider>;
}

export function useChild(): string {
  return useContext(ChildContext);
}
