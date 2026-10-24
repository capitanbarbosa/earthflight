import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: false, // Cesium/Three own long-lived GL contexts; avoid double-mount churn in dev.
  poweredByHeader: false,
  async headers() {
    return [
      {
        // Cesium assets are content-stable per install; cache aggressively.
        source: "/cesium/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800, immutable" }],
      },
    ];
  },
};

export default nextConfig;
