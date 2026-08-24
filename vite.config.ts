import { defineConfig } from "vite";
import { runAction, uxp } from "vite-uxp-plugin";
import react from "@vitejs/plugin-react";

import { config } from "./uxp.config";

const action = process.env.BOLT_ACTION;
const mode = process.env.MODE;
process.env.VITE_BOLT_MODE = mode;
process.env.VITE_BOLT_WEBVIEW_UI = (config.webviewUi === true).toString();
process.env.VITE_BOLT_WEBVIEW_PORT = config.webviewReloadPort.toString();

if (action) runAction(config, action);

const shouldNotEmptyDir =
  mode === "dev" && config.manifest.requiredPermissions?.enableAddon;

export default defineConfig({
  plugins: [uxp(config, mode), react()],
  build: {
    sourcemap: mode && ["dev", "build"].includes(mode) ? true : false,
    // A readable bundle is worth more than a small one while the plugin is
    // only ever loaded through UDT and the person reading it is the person who
    // wrote it. Once it is packaged for someone else to install, nobody reads
    // it and the download size is what they experience instead.
    minify: mode === "package" || mode === "zip",
    emptyOutDir: !shouldNotEmptyDir,
    rollupOptions: {
      external: ["photoshop", "uxp", "fs", "os", "path", "process", "shell"],
      output: {
        // format: "cjs",
        format: "iife", // Needed for Webview UI in Vue to prevent global overrides
      },
    },
  },
  publicDir: "public",
});
