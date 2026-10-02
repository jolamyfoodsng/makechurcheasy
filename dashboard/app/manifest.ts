import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/admin",
    name: "MakeChurchEasy Admin Dashboard",
    short_name: "MCE Admin",
    description: "Manage your MakeChurchEasy account and church platform.",
    start_url: "/admin",
    scope: "/admin",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    background_color: "#0f172a",
    theme_color: "#0f172a",
    icons: [
      {
        src: "/android-chrome-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/android-chrome-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable",
      },
      {
        src: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
