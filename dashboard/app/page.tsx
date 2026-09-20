import type { Metadata } from "next";
import Homepage from "./homepage";

export const metadata: Metadata = {
  title: "MakeChurchEazy — Church media. Without the complicated OBS setup.",
  description: "Display Bible verses, worship lyrics, lower thirds, media and more directly from your OBS workflow. Church presentation tools built for your media team.",
};

export default function Page() {
  return <Homepage />;
}
