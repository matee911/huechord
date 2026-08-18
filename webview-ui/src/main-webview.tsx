import React, { useState, useEffect } from "react";
import * as webviewAPI from "./webview-api";
import { initWebview } from "./webview-setup";
import { getPalette, subscribeToPalette } from "./palette-store";

export const App = () => {
  initWebview(webviewAPI);
  const [message, setMessage] = useState("Connecting...");

  useEffect(
    () =>
      subscribeToPalette(() =>
        setMessage(`Received ${getPalette().length} dominant colors`),
      ),
    [],
  );

  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        color: "var(--uxp-host-text-color, #ccc)",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h2>{message}</h2>
      <p style={{ opacity: 0.6 }}>
        WebView context active — postMessage bridge OK
      </p>
    </main>
  );
};
