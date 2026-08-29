import { NuqsAdapter } from "nuqs/adapters/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";

import "./index.css";

const root = document.querySelector("#root");
if (!root) {
  throw new Error("Missing #root element");
}

// nuqs needs an adapter to reach the URL. This app has no router, so it takes
// the plain React one, which reads and writes window.location directly.
createRoot(root).render(
  <StrictMode>
    <NuqsAdapter>
      <App />
    </NuqsAdapter>
  </StrictMode>
);
