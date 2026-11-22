import type { Metadata } from "next";
import Presenter from "./Presenter";

// Hidden control panel for whoever runs the demo: not linked anywhere, not indexed.
export const metadata: Metadata = {
  title: "Presenter · Tutor Grandma",
  robots: { index: false, follow: false },
};

export default function PresenterPage() {
  return <Presenter />;
}
