const express = require("express");
const path = require("path");
const { ADMIN_DIST, SUPERADMIN_DIR, CHECKIN_DIST, ICONS_DIR, PROJECT_ROOT, UPLOAD_DIR } = require("../config/constants");

function mountFrontendRoutes(app) {
  app.use(express.static(PROJECT_ROOT));
  app.use("/icons", express.static(ICONS_DIR));
  app.use("/uploads", express.static(UPLOAD_DIR, { maxAge: "30d" }));

  // Admin dashboard: the Vite/React build output (admin-frontend/dist).
  app.get("/admin", (req, res) => res.sendFile(path.join(ADMIN_DIST, "index.html")));
  app.use("/admin", express.static(ADMIN_DIST));

  // Separate super-admin panel — different interface, its own API namespace.
  app.get("/superadmin", (req, res) => res.sendFile(path.join(SUPERADMIN_DIR, "index.html")));
  app.use("/superadmin", express.static(SUPERADMIN_DIR));

  // Member check-in: the Vite/React build output (checkin-frontend/dist). Serve the
  // hashed assets first, then fall through to the HTML shell for both the bare page
  // and per-gym slugs like /checkin/nova-fitness.
  app.use("/checkin", express.static(CHECKIN_DIST));

  // A real, network-fetchable manifest (not the blob: URL the app swaps in at
  // runtime) so every install path — including Android Chrome's own "Add to Home
  // screen" menu, which doesn't always pick up a manifest link changed after page
  // load — lands on this gym's slug instead of the shared /manifest.json (whose
  // start_url is the admin panel). Must be registered before the /checkin/:slug
  // catch-all below, or "manifest.json" would be read as a slug.
  app.get("/checkin/manifest.json", (req, res) => {
    const slug = String(req.query.slug || "").trim();
    const name = String(req.query.name || "").trim() || "Gym Check-in";
    const startUrl = slug ? `/checkin/${encodeURIComponent(slug)}` : "/checkin";
    res.type("application/manifest+json").json({
      id: startUrl,
      name,
      short_name: name.length > 12 ? name.slice(0, 12).trim() : name,
      description: "Quick member check-in for your gym.",
      start_url: startUrl,
      scope: "/checkin/",
      display: "standalone",
      background_color: "#ffffff",
      theme_color: "#f86a10",
      orientation: "portrait",
      icons: [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      ],
    });
  });

  app.get("/checkin", (req, res) => res.sendFile(path.join(CHECKIN_DIST, "index.html")));
  app.get("/checkin/:slug", (req, res) => res.sendFile(path.join(CHECKIN_DIST, "index.html")));

  app.get("/", (req, res) => res.redirect("/admin"));
}

module.exports = mountFrontendRoutes;
