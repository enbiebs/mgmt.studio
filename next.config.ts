import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the project root so Next doesn't guess it from stray lockfiles elsewhere.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
