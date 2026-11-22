"use client";
// Mount once (MessageList does). Renders the open report through a portal to document.body.
// The report body loads lazily, in the browser's idle time, so the first tap is quick.
import { lazy, Suspense, useEffect } from "react";
import { createPortal } from "react-dom";
import { closeReport, useOpenReport } from "./store";

const load = () => import("./report-overlay");
const Overlay = lazy(load);

export function ReportHost() {
  const view = useOpenReport();

  useEffect(() => {
    const idle = (window as unknown as { requestIdleCallback?: (f: () => void) => number }).requestIdleCallback;
    const id = idle ? idle(() => void load()) : window.setTimeout(() => void load(), 2000);
    return () => {
      if (!idle) clearTimeout(id);
    };
  }, []);

  if (!view) return null;
  return createPortal(
    <Suspense fallback={null}>
      <Overlay initialView={view} onClose={closeReport} />
    </Suspense>,
    document.body,
  );
}
