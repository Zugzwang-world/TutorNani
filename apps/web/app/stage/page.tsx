import type { Metadata, Viewport } from "next";
import { Stage } from "./stage";

// The one-screen demo (REFINE R1): Nani's world on the left, the parents' world on the right.
export const metadata: Metadata = {
  title: "Stage · Tutor Grandma",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0b0b12",
};

export default function StagePage() {
  return <Stage />;
}
