import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  // Allow large static assets
  experimental: {
    largePageDataBytes: 512 * 1024,
  },
};

export default nextConfig;
