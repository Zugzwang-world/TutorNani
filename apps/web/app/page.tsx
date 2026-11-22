import type { Viewport } from "next";
import { GuidanceChat } from "@/components/chat/guidance-chat";

// Parents guide Nani by chatting with her five agents in one group chat (PLAN.md B4).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: "#fff8ee",
};

export default function Home() {
  return <GuidanceChat />;
}
