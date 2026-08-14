import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Node by default, so main-process tests stay fast. Renderer tests opt into
    // a DOM with a `@vitest-environment jsdom` docblock.
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test/setup.ts"],
    coverage: {
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/**/env.d.ts", "src/test/**"],
    },
  },
});
