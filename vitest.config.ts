import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "happy-dom",
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/client/setup.ts", "tests/performance/**"],
    setupFiles: ["./tests/client/setup.ts"],
  },
});
