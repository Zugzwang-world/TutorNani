import type { Metadata } from "next";
import { ToyApp } from "./toy-app";

export const metadata: Metadata = { title: "Nani · toy" };

export default function ToyPage() {
  return <ToyApp />;
}
