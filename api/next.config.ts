import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["mongodb"],
  turbopack: {
    root: ".",
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
