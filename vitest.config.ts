import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Tests that assert error paths log real errors; printing them on a green
    // run makes a passing suite look broken. Failing tests still print in full.
    silent: "passed-only",
  },
});
