const express = require("express");
const path = require("path");
const { ADMIN_DIR, CHECKIN_DIR, ICONS_DIR, PROJECT_ROOT, UPLOAD_DIR } = require("../config/constants");

function mountFrontendRoutes(app) {
  app.use(express.static(PROJECT_ROOT));
  app.use("/icons", express.static(ICONS_DIR));
  app.use("/uploads", express.static(UPLOAD_DIR, { maxAge: "30d" }));
  app.get("/admin", (req, res) => res.sendFile(path.join(ADMIN_DIR, "index.html")));
  app.get("/checkin", (req, res) => res.sendFile(path.join(CHECKIN_DIR, "index.html")));
  app.use("/admin", express.static(ADMIN_DIR));
  app.use("/checkin", express.static(CHECKIN_DIR));
  app.get("/", (req, res) => res.redirect("/admin"));
}

module.exports = mountFrontendRoutes;
