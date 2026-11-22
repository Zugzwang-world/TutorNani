import type { Metadata, Viewport } from "next";
import { Noto_Color_Emoji, Noto_Sans_Devanagari, Nunito } from "next/font/google";
import "./globals.css";

// Rounded Latin, Devanagari, and one bundled colour-emoji font so emoji match on every screen.
const nunito = Nunito({ variable: "--font-nunito", subsets: ["latin"], display: "swap" });
const devanagari = Noto_Sans_Devanagari({ variable: "--font-devanagari", subsets: ["devanagari"], display: "swap" });
const emoji = Noto_Color_Emoji({ variable: "--font-emoji", subsets: ["emoji"], weight: "400", display: "swap", preload: false });

export const metadata: Metadata = {
  title: "Tutor Grandma",
  description: "Grandma, in a plush toy",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#fff8ee",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${nunito.variable} ${devanagari.variable} ${emoji.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
