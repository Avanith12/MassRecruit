import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prisma's query engine must not be bundled by webpack.
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
};

export default nextConfig;
