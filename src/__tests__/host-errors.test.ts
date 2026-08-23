import { describe, it, expect } from "vitest";
import { isHostBusy } from "../uxp/host-errors";

describe("telling a busy host from a real failure", () => {
  // Verbatim from Photoshop 27.9.1, caught while the panel was being dragged
  // between docks. This is the case the whole predicate exists for.
  it("recognises the refusal Photoshop actually sends", () => {
    expect(isHostBusy(new Error("host is in a modal state"))).toBe(true);
  });

  it.each([
    ["a longer sentence around it", "The host is in a modal state right now."],
    ["different capitalisation", "Host is in a Modal State"],
  ])("recognises it despite %s", (_case, message) => {
    expect(isHostBusy(new Error(message))).toBe(true);
  });

  it.each([
    ["no open document", "no active document"],
    ["a read failure", "Failed to read pixel data"],
    ["an empty message", ""],
  ])("does not mistake %s for a busy host", (_case, message) => {
    expect(isHostBusy(new Error(message))).toBe(false);
  });

  // The host throws through a bridge that does not always hand back an Error,
  // and a predicate that threw here would turn a logged failure into a crash.
  it.each([
    ["a bare string", "host is in a modal state", true],
    ["undefined", undefined, false],
    ["null", null, false],
    ["an object", { message: "host is in a modal state" }, false],
  ])("survives being handed %s", (_case, thrown, expected) => {
    expect(isHostBusy(thrown)).toBe(expected);
  });
});
