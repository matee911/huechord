import { describe, it, expect } from "vitest";

import { config } from "../../uxp.config";

// These values are an architectural decision, not a preference: ADR-006 fixes
// the manifest version, and ADR-005's apiVersion 2 and PS 26.0 floor carry over
// into it. They drifted from the ADRs once already, silently, because nothing
// checked them. Changing any of them should fail here and send the author back
// to the ADR rather than through review unnoticed.
describe("plugin manifest", () => {
  it("declares the manifest version recorded in the ADRs", () => {
    expect(config.manifest.manifestVersion).toBe(6);
  });

  it("targets Photoshop at the documented floor with apiVersion 2", () => {
    expect(config.manifest.host).toEqual([
      expect.objectContaining({
        app: "PS",
        minVersion: "26.0.0",
        data: expect.objectContaining({ apiVersion: 2 }),
      }),
    ]);
  });
});
