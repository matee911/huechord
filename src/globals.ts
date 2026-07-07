/* eslint-disable @typescript-eslint/no-require-imports -- host-conditional module loading: only the matching host injects this module at runtime, so it can't be a static import */
import type { premierepro as premiereproTypes } from "./types/ppro";

if (typeof require === "undefined") {
  // @ts-expect-error -- stubbing require in hosts that don't provide it
  window.require = (_moduleName: string) => {
    return {};
  };
}

export const uxp = require("uxp") as typeof import("uxp");
const hostName = uxp && uxp?.host?.name?.toLowerCase();

export const photoshop = (
  hostName === "photoshop" ? require("photoshop") : {}
) as typeof import("photoshop");

export const indesign = (
  hostName === "indesign" ? require("indesign") : {}
) as unknown;
export const premierepro = (
  hostName === "premierepro" ? require("premierepro") : {}
) as premiereproTypes;
export const illustrator = (
  hostName === "illustrator" ? require("illustrator") : {}
) as unknown;
