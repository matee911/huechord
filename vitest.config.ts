import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Tests that assert error paths log real errors; printing them on a green
    // run makes a passing suite look broken. Failing tests still print in full.
    silent: "passed-only",
    // Keeps mock state from bleeding between tests — a swapped logger or spy
    // must not survive into the next one.
    restoreMocks: true,
  },
});
