import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Keep visited dynamic pages in the client router cache for 30 s so
    // switching between tabs is instant. Every write calls router.refresh(),
    // which invalidates this cache, so no stale data is shown after a save.
    staleTimes: { dynamic: 30, static: 180 },
  },
};

export default nextConfig;
