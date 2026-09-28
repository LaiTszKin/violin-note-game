import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 明確釘死 Turbopack 根目錄：避免 Next 向上偵測到家目錄的無關 lockfile 而發警告。
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
