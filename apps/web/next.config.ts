import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@n0va/core", "@n0va/db", "@n0va/auth", "@n0va/authz", "@n0va/ui"],
};

export default nextConfig;