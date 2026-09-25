import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const configDir = fileURLToPath(new URL(".", import.meta.url));

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: configDir,
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [
          {
            type: "host",
            value: "makechurcheasy.creatorstudioslabs.stream",
          },
        ],
        destination: "https://makechurcheazy.com/:path*",
        permanent: true,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
