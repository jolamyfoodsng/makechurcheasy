import type { Metadata } from "next";
import Homepage from "./homepage";

export const metadata: Metadata = {
  title: "MakeChurchEazy — The Complete Church Presentation Dock for OBS Studio",
  description: "Real-time Voice-to-Scripture AI, worship lyrics, multi-version Bible comparisons, lower thirds, and live countdowns built directly into OBS Studio. Zero NDI lag.",
};

export default function Page() {
  return <Homepage />;
}
