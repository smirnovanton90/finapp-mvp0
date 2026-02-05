import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [{ source: "/limits", destination: "/goals", permanent: true }];
  },
};

export default nextConfig;
