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
