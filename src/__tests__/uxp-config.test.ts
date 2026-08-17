import { describe, it, expect } from "vitest";

import { config } from "../../uxp.config";

// Pinned by ADR-006. These drifted from the ADRs once already — silently, from
// the first commit — because nothing compared the config to the decision.
describe("uxp.config", () => {
  it("matches the manifest values recorded in ADR-006", () => {
    expect(config.manifest.manifestVersion).toBe(6);
    expect(config.manifest.host).toEqual([
      { app: "PS", minVersion: "26.0.0", data: { apiVersion: 2 } },
    ]);
  });
});
