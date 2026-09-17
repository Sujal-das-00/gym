import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The Express app serves this build from /admin (see backend/src/routes/frontendRoutes.js),
// so every emitted asset URL has to be prefixed with that path.
export default defineConfig({
  base: "/admin/",
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    // `npm run dev` here proxies the JSON API to the Express server on 5051 so the
    // React dev server can be used without building.
    proxy: {
      "/api": "http://localhost:5051",
      "/uploads": "http://localhost:5051",
    },
  },
});
