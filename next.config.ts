import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 明確釘死 Turbopack 根目錄：避免 Next 向上偵測到家目錄的無關 lockfile 而發警告。
  turbopack: {
    root: process.cwd(),
  },
  // Next 16 默認封鎖「非 localhost 主機」對 dev 資源的請求（chunks／HMR）；
  // 本機測試工具（Playwright、browser tools）以 127.0.0.1 連入，故列入白名單。
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
