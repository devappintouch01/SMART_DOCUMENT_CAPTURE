import type { NextConfig } from "next";

// Cache Components stays off: every page shows live Document data, so there
// is no static shell worth prerendering.
const nextConfig: NextConfig = {
  // exceljs relies on Node internals and is loaded as-is on the server.
  serverExternalPackages: ["exceljs"],
  // The demo reset reads the example documents from disk; make sure they ship
  // with the function that runs it.
  outputFileTracingIncludes: { "/demo": ["./fixtures/demo/**/*"] },
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
