import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "webview-ui/src/**/*.test.ts"],
    environment: "node",
    // Tests that assert error paths log real errors; printing them on a green
    // run makes a passing suite look broken. Failing tests still print in full.
    silent: "passed-only",
    coverage: {
      provider: "v8",
      // Scoped to the code the test pyramid is supposed to reach. The React
      // entrypoints, the WebView host glue and the type-only modules are
      // wiring with nothing to assert; measuring them would produce a number
      // that drops whenever someone adds a line of bootstrap.
      include: [
        "src/algorithms/**/*.ts",
        "src/bridge/**/*.ts",
        "src/lib/**/*.ts",
        "src/uxp/**/*.ts",
      ],
      exclude: ["src/**/types.ts"],
      reporter: ["text", "html"],
      // Set at the level the suite already holds, so the gate catches a
      // regression rather than demanding a number nobody has hit yet. Raise
      // them when the real figure moves up, never lower them to make a commit
      // go through.
      thresholds: {
        statements: 95,
        branches: 90,
        functions: 100,
        lines: 95,
      },
    },
  },
});
