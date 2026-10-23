import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { unsupportedFeatures } from "./browserSupport.js";

const missing = unsupportedFeatures();
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {missing.length ? (
      <main role="alert">
        <h1>Browser update required</h1>
        <p>Open this app over HTTPS (or localhost) in a current browser.</p>
        <p>Required features are unavailable: {missing.join(", ")}.</p>
      </main>
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
