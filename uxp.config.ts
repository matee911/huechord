// Type-only: this module is imported by a Node-environment test, and a value
// import would pull the Vite build plugin into that graph.
import type { UXP_Manifest, UXP_Config } from "vite-uxp-plugin";
import { version } from "./package.json";

const extraPrefs = {
  hotReloadPort: 8080,
  webviewUi: true,
  webviewReloadPort: 8082,
  copyZipAssets: ["public-zip/*"],
  uniqueIds: true,
};

// Read from the environment rather than vite.config.ts, which sets
// VITE_BOLT_MODE only after this module has already been imported and evaluated.
const isDev = process.env.MODE === "dev";

export const id = "com.colors.harmony-wheel";
const name = "Color Harmony Wheel";

const manifest: UXP_Manifest = {
  id,
  name,
  version,
  main: "index.html",
  manifestVersion: 6,
  host: [
    {
      app: "PS",
      minVersion: "27.0.0",
      data: {
        apiVersion: 2,
      },
    },
  ],
  entrypoints: [
    {
      type: "panel",
      id: `${id}.main`,
      label: {
        default: name,
      },
      minimumSize: { width: 280, height: 300 },
      maximumSize: { width: 600, height: 800 },
      preferredDockedSize: { width: 300, height: 400 },
      preferredFloatingSize: { width: 350, height: 450 },
      icons: [
        {
          width: 23,
          height: 23,
          path: "icons/dark.png",
          scale: [1, 2],
          theme: ["darkest", "dark", "medium"],
        },
        {
          width: 23,
          height: 23,
          path: "icons/light.png",
          scale: [1, 2],
          theme: ["lightest", "light"],
        },
      ],
    },
  ],
  featureFlags: {
    enableAlerts: true,
  },
  requiredPermissions: {
    localFileSystem: "plugin",
    // The hot-reload socket exists only while developing. Shipping the
    // permission would let the installed plugin talk to whatever else on the
    // user's machine happens to be listening on that port.
    ...(isDev && {
      network: {
        domains: [`ws://localhost:${extraPrefs.hotReloadPort}`],
      },
    }),
    webview: {
      allow: "yes",
      allowLocalRendering: "yes",
      domains: [],
      enableMessageBridge: "localAndRemote",
    },
    allowCodeGenerationFromStrings: true,
  },
  icons: [
    {
      width: 48,
      height: 48,
      path: "icons/plugin-icon.png",
      scale: [1, 2],
      theme: ["darkest", "dark", "medium", "lightest", "light", "all"],
      species: ["pluginList"],
    },
  ],
};

export const config: UXP_Config = {
  manifest,
  ...extraPrefs,
};
