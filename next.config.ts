import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname),
  allowedDevOrigins: ["10.150.0.155"],
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb"
    }
  }
};

export default nextConfig;
