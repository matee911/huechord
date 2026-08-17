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
    // Deliberate for as long as this plugin is only ever loaded through UDT:
    // a readable bundle is worth more than a smaller one while nobody is
    // shipping it. Minifying cuts it by roughly two thirds, so turn it on for
    // the packaging modes once builds actually go out to users.
    minify: false,
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
