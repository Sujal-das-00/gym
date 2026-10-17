import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import { isNativeApp } from "./lib/native.js";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if (isNativeApp()) {
  // Inside the mobile app: no service worker (it only slows every request down
  // and web push is handled natively), and no GPU-heavy blur effects, which make
  // scrolling in an Android WebView stutter.
  document.documentElement.classList.add("native-app");
  navigator.serviceWorker
    ?.getRegistrations()
    .then((registrations) => registrations.forEach((registration) => registration.unregister()))
    .catch(() => {});
} else if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {});
  });
}
