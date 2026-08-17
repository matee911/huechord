import { describe, it, expect, vi } from "vitest";

import { config } from "../../uxp.config";

// The manifest is assembled at import time from process.env.MODE, so asking
// what a different mode produces means re-importing with that value in place.
const manifestForMode = async (mode: string | undefined) => {
  vi.resetModules();
  const previous = process.env.MODE;
  if (mode === undefined) delete process.env.MODE;
  else process.env.MODE = mode;
  try {
    return (await import("../../uxp.config")).config.manifest;
  } finally {
    if (previous === undefined) delete process.env.MODE;
    else process.env.MODE = previous;
  }
};

// Manifest version and apiVersion are pinned by ADR-006, the host floor by
// ADR-007. These drifted from the ADRs once already — silently, from the first
// commit — because nothing compared the config to the decision.
describe("uxp.config", () => {
  it("matches the manifest values recorded in ADR-006", () => {
    expect(config.manifest.manifestVersion).toBe(6);
    expect(config.manifest.host).toEqual([
      { app: "PS", minVersion: "27.0.0", data: { apiVersion: 2 } },
    ]);
  });

  // The hot-reload socket is a development affordance. A shipped plugin that
  // declares it is asking for permission to talk to whatever else on the user's
  // machine happens to be listening on that port.
  it("declares the hot-reload socket only while developing", async () => {
    const dev = await manifestForMode("dev");

    expect(dev.requiredPermissions?.network?.domains).toEqual([
      "ws://localhost:8080",
    ]);
  });

  it.each(["build", "package", "zip", undefined])(
    "declares no network domain in %s mode",
    async (mode) => {
      const manifest = await manifestForMode(mode);

      expect(manifest.requiredPermissions?.network).toBeUndefined();
    },
  );

  // Nothing in either bundle generates code from a string, and the WebView
  // bridge is enabled by the webview permissions alone. Granting this anyway
  // is what would turn any other reachable input into an execution concern.
  it("does not ask to generate code from strings", () => {
    expect(
      config.manifest.requiredPermissions?.allowCodeGenerationFromStrings,
    ).toBeUndefined();
  });
});
