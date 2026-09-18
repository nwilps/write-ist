import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Fixtures are large; a slow first parse should not be read as a hang.
    testTimeout: 30_000,
  },
});
