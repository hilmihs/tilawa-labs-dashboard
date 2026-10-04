import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Tested modules sit next to a thin DB wrapper (e.g. lib/confirmations/*.ts)
    // that imports other repo code via the "@/*" tsconfig path. Vite resolves the
    // whole module graph eagerly on import, even for exports the test never
    // touches, so the alias has to be registered here too or resolution fails
    // before a single test runs.
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    // Pure helpers are unit-tested; everything else in this repo is verified by
    // the read-only scripts/probe-*.ts convention. `app/**` is included because
    // the Maahir pages keep their payload-shaping in a pure `view-model.ts` next
    // to the page — tests that live outside `lib/` would otherwise never run.
    include: ["lib/**/*.test.ts", "app/**/*.test.ts"],
    environment: "node",
  },
});
