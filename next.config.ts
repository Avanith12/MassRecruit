import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prisma's query engine must not be bundled by webpack.
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
  // Consent PDFs (≤ 5 MB) are uploaded through server actions.
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // Browsers only honor HSTS over HTTPS, so this is a no-op on http://localhost.
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
