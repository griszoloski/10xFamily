import { defineConfig } from "vitest/config";
import path from "path";

// getViteConfig() from "astro/config" is incompatible with @cloudflare/vite-plugin:
// the plugin throws when Vitest sets resolve.external on the node environment.
// Manual alias replicates the @/* → src/* tsconfig path for test files.
// When future test phases need astro:env/server, add an explicit mock plugin here.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    name: "unit",
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
