"use client";
// Mount once (MessageList does). Renders the open profile through a portal to document.body.
// The heavy body loads lazily; it is fetched in the browser's idle time so the first tap is instant.
import { lazy, Suspense, useEffect } from "react";
import { createPortal } from "react-dom";
import { closeProfile, useOpenProfile } from "./store";

const load = () => import("./profile-overlay");
const Overlay = lazy(load);

export function ProfileHost() {
  const bot = useOpenProfile();

  useEffect(() => {
    const idle = (window as unknown as { requestIdleCallback?: (f: () => void) => number }).requestIdleCallback;
    const id = idle ? idle(() => void load()) : window.setTimeout(() => void load(), 1500);
    return () => {
      if (!idle) clearTimeout(id);
    };
  }, []);

  if (!bot) return null;
  return createPortal(
    <Suspense fallback={null}>
      <Overlay key={bot} bot={bot} onClose={closeProfile} />
    </Suspense>,
    document.body,
  );
}
