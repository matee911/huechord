import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import config from "../../vitest.config";

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  scripts: Record<string, string>;
  "simple-git-hooks": Record<string, string>;
};

const coverage = config.test?.coverage;

// A coverage gate that is configured but never invoked reads as protection
// while protecting nothing, so the wiring is asserted rather than assumed.
describe("coverage gate", () => {
  it("runs on every commit", () => {
    expect(packageJson["simple-git-hooks"]["pre-commit"]).toContain(
      "test:coverage",
    );
  });

  it("has a script for the hook to call", () => {
    expect(packageJson.scripts["test:coverage"]).toContain("--coverage");
  });

  it("fails the run instead of only reporting", () => {
    // Without thresholds, `vitest run --coverage` exits 0 no matter how far
    // coverage falls, and the hook becomes a slow no-op.
    const thresholds =
      coverage && "thresholds" in coverage ? coverage.thresholds : undefined;

    expect(thresholds).toEqual({
      statements: expect.any(Number),
      branches: expect.any(Number),
      functions: expect.any(Number),
      lines: expect.any(Number),
    });
  });

  it("measures the code the pyramid is meant to reach", () => {
    // Scoped deliberately: React entrypoints and WebView glue would drag the
    // number around for reasons unrelated to how well the logic is tested.
    expect(coverage && "include" in coverage ? coverage.include : []).toEqual([
      "src/algorithms/**/*.ts",
      "src/bridge/**/*.ts",
      "src/lib/**/*.ts",
      "src/uxp/**/*.ts",
    ]);
  });
});
