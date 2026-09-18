import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Express serves this build from /checkin, including per-gym slugs like
// /checkin/nova-fitness (see backend/src/routes/frontendRoutes.js). The slug makes
// the URL one level deeper than the app root, so asset URLs must be absolute.
export default defineConfig({
  base: "/checkin/",
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    // `npm run dev` proxies the JSON API to the Express server on 5051 so the
    // React dev server can be used without building.
    proxy: {
      "/api": "http://localhost:5051",
      "/uploads": "http://localhost:5051",
      // The PWA pieces live on the Express side (backend/src/routes/frontendRoutes.js
      // builds the manifest per gym), so `npm run dev` has to borrow them too —
      // without the manifest, the icons it points at and the service worker, the
      // browser can only make a bookmark shortcut instead of installing the app.
      "/checkin/manifest.json": "http://localhost:5051",
      "/icons": "http://localhost:5051",
      "/service-worker.js": "http://localhost:5051",
    },
    allowedHosts:["dubai-visibility-cheap-vote.trycloudflare.com"]
  },
});
