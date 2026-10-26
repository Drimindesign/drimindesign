import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      // Tailwind only processes global stylesheets. CSS Modules skip the loader: its
      // `as: "*.css"` output would otherwise lose the `.module.css` suffix and be parsed
      // as global CSS, silently dropping `:global()` rules and scoped class names.
      "*.css": {
        condition: { not: { path: "*.module.css" } },
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

// Cloudflare bindings (assets, images) inside `next dev`; deploys build through OpenNext.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
void initOpenNextCloudflareForDev();
