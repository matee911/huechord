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

// This job checks out a branch and then runs that branch's own config files
// and tests. On a hosted runner that is a disposable VM; on somebody's machine
// it is arbitrary code execution as that user, which is what CI here used to
// be. Going back has to fail a test rather than pass review as one changed
// line — see the CI section of CONTRIBUTING for what it cost.
describe("ci workflow", () => {
  it("runs on a hosted runner, not on anybody's machine", () => {
    expect(workflow).toContain("runs-on: ubuntu-latest");
    expect(workflow).not.toContain("self-hosted");
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
    expect(packageJson["simple-git-hooks"]["pre-push"]).toContain(
      "yarn verify",
    );
  });

  // Cheap and it can veto the push outright, so verifying first would be work
  // thrown away.
  it("checks the branch is still pushable before verifying anything", () => {
    const prePush = packageJson["simple-git-hooks"]["pre-push"];

    expect(prePush.indexOf("reject-push-to-merged-branch")).toBeLessThan(
      prePush.indexOf("yarn verify"),
    );
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
