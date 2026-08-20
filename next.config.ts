import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript:
    process.env.DOCKER_BUILD === "1" ? { ignoreBuildErrors: true } : undefined,
};

export default nextConfig;
