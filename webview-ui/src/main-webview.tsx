import React, { useState, useEffect } from "react";
import * as webviewAPI from "./webview-api";
import { initWebview } from "./webview-setup";

export const App = () => {
  const { api } = initWebview(webviewAPI);
  const [message, setMessage] = useState("Connecting...");

  useEffect(() => {
    setMessage("Color Harmony Wheel — WebView ready");
  }, []);

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
      <p style={{ opacity: 0.6 }}>WebView context active — postMessage bridge OK</p>
    </main>
  );
};
