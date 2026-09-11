import type { Metadata } from "next";
import About from "@/components/about/About";

export const metadata: Metadata = {
  title: "About — Remington McElhaney",
  description: "Remington McElhaney is a motion designer.",
};

export default function Page() {
  return <About />;
}
