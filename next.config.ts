import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 避免回應洩露框架版本（SEC-F1）。
  poweredByHeader: false,
  // 基本安全標頭（SEC-F1；defense-in-depth——靜態遊戲無第三方 script／個人資料）。
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
  // 明確釘死 Turbopack 根目錄：避免 Next 向上偵測到家目錄的無關 lockfile 而發警告。
  turbopack: {
    root: process.cwd(),
  },
  // Next 16 默認封鎖「非 localhost 主機」對 dev 資源的請求（chunks／HMR）；
  // 本機測試工具（Playwright、browser tools）以 127.0.0.1 連入，故列入白名單。
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
