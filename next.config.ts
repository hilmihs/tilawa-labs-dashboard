import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Azure Container Apps Docker image.
  output: "standalone",
  // The IDCH box (Azure pipeline) hangs in "Running TypeScript" for 55+ minutes
  // and the job dies at its 60-minute cap — on 23 Sep 2026 that left production
  // with its static files already deleted. The pipeline sets this flag so the
  // server build skips the type-check. The gate is not lost: the VPS Docker
  // build (GitHub deploy.yml) builds the same main commit WITH the type-check.
  typescript: {
    ignoreBuildErrors: process.env.SKIP_BUILD_TYPECHECK === "1",
  },
  turbopack: {
    // Pin the workspace root to this app — a pnpm lockfile in an ancestor
    // Downloads/ dir was otherwise being auto-detected as the root.
    root: dirname(fileURLToPath(import.meta.url)),
  },
  // The PDF generators read fonts/logos off disk with process.cwd(), which the
  // bundler can't see. Without these the files are traced out of a serverless
  // build and the letters render fontless (or, for piket, silently logo-less).
  outputFileTracingIncludes: {
    "/[program]/surat/**": ["./assets/surat/**"],
    "/api/hkm-letters/**": ["./assets/surat/**"],
    "/[program]/piket/**": ["./public/mabni-logo.png"],
  },
};

export default nextConfig;
