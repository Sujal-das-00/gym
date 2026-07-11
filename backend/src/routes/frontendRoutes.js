const express = require("express");
const path = require("path");
const { ADMIN_DIR, SUPERADMIN_DIR, CHECKIN_DIR, ICONS_DIR, PROJECT_ROOT, UPLOAD_DIR } = require("../config/constants");

function mountFrontendRoutes(app) {
  app.use(express.static(PROJECT_ROOT));
  app.use("/icons", express.static(ICONS_DIR));
  app.use("/uploads", express.static(UPLOAD_DIR, { maxAge: "30d" }));

  app.get("/admin", (req, res) => res.sendFile(path.join(ADMIN_DIR, "index.html")));
  app.use("/admin", express.static(ADMIN_DIR));

  // Separate super-admin panel — different interface, its own API namespace.
  app.get("/superadmin", (req, res) => res.sendFile(path.join(SUPERADMIN_DIR, "index.html")));
  app.use("/superadmin", express.static(SUPERADMIN_DIR));

  // Serve real check-in assets (checkin.js, styles.css) first, then fall through to
  // the HTML shell for both the bare page and per-gym slugs like /checkin/nova-fitness.
  app.use("/checkin", express.static(CHECKIN_DIR));
  app.get("/checkin", (req, res) => res.sendFile(path.join(CHECKIN_DIR, "index.html")));
  app.get("/checkin/:slug", (req, res) => res.sendFile(path.join(CHECKIN_DIR, "index.html")));

  app.get("/", (req, res) => res.redirect("/admin"));
}

module.exports = mountFrontendRoutes;
