import type { Metadata, Viewport } from "next";
import Wall from "@/components/wall/Wall";

export const metadata: Metadata = {
  title: "Home base · Tutor Grandma",
};

export const viewport: Viewport = {
  themeColor: "#0b0b12",
};

// The projector wall (C4). Everything live happens in the client component.
export default function HomeBase() {
  return <Wall />;
}
