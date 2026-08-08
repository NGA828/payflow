import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The Arena/e2b live preview proxies the dev server under per-port
  // subdomains; allow cross-origin dev requests from those hosts.
  allowedDevOrigins: ["*.e2b.app"],
  serverExternalPackages: [
    "@prisma/client",
    "@prisma/adapter-pg",
    "bcryptjs",
    "@react-pdf/renderer",
    "exceljs",
    "@electric-sql/pglite",
    "pglite-prisma-adapter",
    "pg",
  ],
  // The payslip PDF embeds Inter woff files resolved by absolute path at
  // runtime (see src/server/payslips/fonts.ts) — standalone output must
  // keep them next to node_modules.
  outputFileTracingIncludes: {
    "/*": ["./node_modules/@fontsource/inter/files/*.woff"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
