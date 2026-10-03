import type { NextConfig } from "next";
import { withPayload } from "@payloadcms/next/withPayload";

const nextConfig: NextConfig = {
  serverExternalPackages: ["mongodb"],
  turbopack: {
    root: ".",
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default withPayload(nextConfig);
