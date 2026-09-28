import type { NextConfig } from "next";
import { staticSecurityHeaders } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  // Do not advertise the framework in an X-Powered-By header.
  poweredByHeader: false,
  experimental: {
    // Keep visited dynamic pages in the client router cache for 30 s so
    // switching between tabs is instant. Every write calls router.refresh(),
    // which invalidates this cache, so no stale data is shown after a save.
    staleTimes: { dynamic: 30, static: 180 },
  },
  async headers() {
    // Content-Security-Policy is set per request (with a nonce) in src/proxy.ts.
    return [{ source: "/:path*", headers: staticSecurityHeaders }];
  },
};

export default nextConfig;
