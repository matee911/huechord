import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const workflow = readFileSync(
  resolve(here, "../../.github/workflows/release.yml"),
  "utf8",
);

// A release is the one artifact a stranger ever sees. Everything asserted here
// is something whose absence would not show up until somebody had already
// downloaded the result.
describe("release workflow", () => {
  it("builds a release from a tag", () => {
    expect(workflow).toMatch(/tags:\s*\["v\*"\]/);
  });

  // Same reasoning as the CI workflow: it runs the tagged commit's own code.
  it("runs on a hosted runner, not on anybody's machine", () => {
    expect(workflow).toContain("runs-on: ubuntu-latest");
    expect(workflow).not.toContain("self-hosted");
  });

  // Photoshop shows the manifest version, never the tag, so a mismatch is
  // invisible from inside the app and misnames every bug report against it.
  it("refuses a tag that disagrees with the plugin version", () => {
    expect(workflow).toContain("require('./package.json').version");
    expect(workflow).toContain("exit 1");
  });

  // Tagging is not a reason to ship something a push would have been stopped
  // for, and "verify after packaging" would notice too late.
  it("verifies before it packages", () => {
    expect(workflow.indexOf("run: yarn verify")).toBeGreaterThan(-1);
    expect(workflow.indexOf("run: yarn verify")).toBeLessThan(
      workflow.indexOf("run: yarn ccx"),
    );
  });

  it("publishes the installer as a release asset", () => {
    expect(workflow).toContain("gh release create");
    expect(workflow).toContain(".ccx");
  });
});
