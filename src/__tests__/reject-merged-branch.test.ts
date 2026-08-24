import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const script = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../scripts/reject-push-to-merged-branch.sh",
);

// git push exports GIT_DIR and friends to its hooks, and this suite runs from
// one. Inheriting them would point every git call below at the real repository
// no matter which directory it runs in — so the throwaway repos would silently
// be this one.
const withoutGitEnv = () =>
  Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
  ) as NodeJS.ProcessEnv;

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, {
    cwd,
    env: withoutGitEnv(),
    stdio: "pipe",
  }).toString();

// The script reads the branch name from git, so the test has to own a real
// repository rather than borrow whatever the suite happens to run in. CI
// checks a pull request out as a detached HEAD, which is a different case
// entirely — covered explicitly below.
const repoOnBranch = (branch: string) => {
  const dir = mkdtempSync(join(tmpdir(), "branch-guard-"));
  git(dir, "init", "--quiet", "--initial-branch", branch);
  // A throwaway repo inherits no identity, and a fresh CI runner has no global
  // one to fall back on -- git then refuses the commit and every test in this
  // file fails in setup, naming an author instead of the behaviour under test.
  // A developer machine hides this: git there derives an identity from the
  // account when none is configured.
  git(dir, "config", "user.email", "guard@example.invalid");
  git(dir, "config", "user.name", "Branch Guard Test");
  git(dir, "commit", "--quiet", "--allow-empty", "-m", "root");
  return dir;
};

// Standing in for gh lets the test drive every answer that matters, including
// the ones awkward to produce for real, like being offline.
const fakeGh = (body: string) => {
  const dir = mkdtempSync(join(tmpdir(), "gh-stub-"));
  const stub = join(dir, "gh");
  writeFileSync(stub, `#!/bin/sh\n${body}\n`);
  chmodSync(stub, 0o755);
  return dir;
};

const run = (cwd: string, ghBody: string) => {
  try {
    execFileSync("sh", [script], {
      cwd,
      env: {
        ...withoutGitEnv(),
        PATH: `${fakeGh(ghBody)}:${process.env.PATH}`,
      },
      stdio: "pipe",
    });
    return { blocked: false, message: "" };
  } catch (error) {
    const failure = error as { status: number; stderr: Buffer };
    return {
      blocked: failure.status !== 0,
      message: failure.stderr.toString(),
    };
  }
};

describe("reject-push-to-merged-branch", () => {
  let onBranch: string;

  beforeAll(() => {
    onBranch = repoOnBranch("test/pixel-pipeline-wiring");
  });

  it("blocks a push to a branch whose pull request is already merged", () => {
    const result = run(onBranch, 'echo "19"');

    expect(result.blocked).toBe(true);
  });

  it("explains what to do instead of just refusing", () => {
    const result = run(onBranch, 'echo "19"');

    expect(result.message).toContain("19");
    expect(result.message).toMatch(/new branch/i);
  });

  it("allows a push when the branch has no merged pull request", () => {
    const result = run(onBranch, "");

    expect(result.blocked).toBe(false);
  });

  // Fail open, deliberately: this is a guard rail, and one that strands you on
  // a plane is worse than one that occasionally lets a mistake through. Only a
  // definite "yes, merged" blocks.
  it("allows a push when gh cannot answer", () => {
    const result = run(onBranch, 'echo "network error" >&2; exit 1');

    expect(result.blocked).toBe(false);
  });

  // How CI checks a pull request out. There is no branch to ask about, and a
  // detached HEAD is not how anyone pushes a branch — so it must not block, or
  // this check would fail every CI run rather than guarding a push.
  it("allows a detached HEAD, which has no branch to look up", () => {
    const detached = repoOnBranch("main");
    git(detached, "checkout", "--quiet", "--detach", "HEAD");

    const result = run(detached, 'echo "19"');

    expect(result.blocked).toBe(false);
  });
});
