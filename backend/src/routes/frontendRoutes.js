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
  app.get("/checkin", (req, res) => res.sendFile(path.join(CHECKIN_DIST, "index.html")));
  app.get("/checkin/:slug", (req, res) => res.sendFile(path.join(CHECKIN_DIST, "index.html")));

  app.get("/", (req, res) => res.redirect("/admin"));
}

module.exports = mountFrontendRoutes;
