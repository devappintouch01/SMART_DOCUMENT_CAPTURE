import type { NextConfig } from "next";

// Cache Components stays off: every page shows live Document data, so there
// is no static shell worth prerendering.
const nextConfig: NextConfig = {
  // exceljs relies on Node internals and is loaded as-is on the server.
  serverExternalPackages: ["exceljs"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
