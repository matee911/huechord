import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const script = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../scripts/reject-push-to-merged-branch.sh",
);

// The script asks `gh` whether this branch already has a merged pull request.
// Standing in for gh lets the test drive every answer that matters — including
// the ones that are awkward to produce for real, like being offline.
const runWithFakeGh = (body: string) => {
  const dir = mkdtempSync(join(tmpdir(), "gh-stub-"));
  const stub = join(dir, "gh");
  writeFileSync(stub, `#!/bin/sh\n${body}\n`);
  chmodSync(stub, 0o755);

  try {
    execFileSync("sh", [script], {
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}` },
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
  it("blocks a push to a branch whose pull request is already merged", () => {
    const result = runWithFakeGh('echo "19"');

    expect(result.blocked).toBe(true);
  });

  it("explains what to do instead of just refusing", () => {
    const result = runWithFakeGh('echo "19"');

    expect(result.message).toContain("19");
    expect(result.message).toMatch(/new branch/i);
  });

  it("allows a push when the branch has no merged pull request", () => {
    const result = runWithFakeGh("");

    expect(result.blocked).toBe(false);
  });

  // Fail open, deliberately: this check is a guard rail, and a guard rail that
  // strands you on a plane is worse than one that occasionally lets a mistake
  // through. Only a definite "yes, merged" blocks.
  it("allows a push when gh cannot answer", () => {
    const result = runWithFakeGh('echo "network error" >&2; exit 1');

    expect(result.blocked).toBe(false);
  });
});
