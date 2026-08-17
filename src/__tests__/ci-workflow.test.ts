import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workflow = readFileSync(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../.github/workflows/ci.yml",
  ),
  "utf8",
);

[redacted]
// and CONTRIBUTING records that risk as knowingly accepted. These three
// properties are what the acceptance rests on, so losing one has to fail here
// rather than quietly widen the exposure.
describe("ci workflow", () => {
  it("skips pull requests coming from a fork", () => {
    expect(workflow).toContain(
      "github.event.pull_request.head.repo.full_name == github.repository",
    );
  });

  it("gives the job a read-only token", () => {
    expect(workflow).toMatch(/permissions:\s*\n\s*contents:\s*read/);
  });

  it("does not leave the checkout token on the runner", () => {
    expect(workflow).toContain("persist-credentials: false");
  });
});

// GitHub cannot block a merge on a red run here — branch protection needs a
// paid plan for a private repo — so the two places that check the code are the
// pre-push hook and a run nobody is forced to read. They are only worth
// anything if they check the same things.
describe("verification is defined in one place", () => {
  const packageJson = JSON.parse(
    readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "../../package.json"),
      "utf8",
    ),
  ) as {
    scripts: Record<string, string>;
    "simple-git-hooks": Record<string, string>;
  };

  const verifySteps = packageJson.scripts.verify
    .split("&&")
    .map((step) => step.trim().replace(/^yarn /, ""));

  it("runs the full verification before a push", () => {
    expect(packageJson["simple-git-hooks"]["pre-push"]).toBe("yarn verify");
  });

  it("checks the build, not only the tests", () => {
    expect(verifySteps).toContain("build");
  });

  it.each(["lint", "format:check", "typecheck", "test", "build"])(
    "covers %s in CI as well",
    (step) => {
      expect(workflow).toContain(`run: yarn ${step}`);
    },
  );

  it("leaves nothing in the local check that CI does not also run", () => {
    const missingFromCi = verifySteps.filter(
      (step) => !workflow.includes(`run: yarn ${step}`),
    );

    expect(missingFromCi).toEqual([]);
  });
});
