const express = require("express");
const fs = require("fs");
const path = require("path");
const { ADMIN_DIST, SUPERADMIN_DIR, CHECKIN_DIST, ICONS_DIR, PROJECT_ROOT, UPLOAD_DIR } = require("../config/constants");
const { repo } = require("../models");
const gymModel = require("../models/gymModel");

const CHECKIN_SHELL = path.join(CHECKIN_DIST, "index.html");

// The one manifest URL per gym, used both by the injection below and by the app's
// own runtime swap, so the browser never sees two manifests for the same gym.
const manifestHref = (slug) =>
  slug ? `/checkin/manifest.json?slug=${encodeURIComponent(slug)}` : "/checkin/manifest.json";

/**
 * Serve the check-in shell with this gym's manifest already linked.
 *
 * Android Chrome reads the manifest as the page loads, so swapping the link in JS
 * after boot is too late for the browser's own "Add to Home screen" menu — the
 * only way to install on phones where beforeinstallprompt never fires. Without
 * the slug in the link from the first byte, that menu falls back to the shared
 * /manifest.json and the installed icon opens the admin panel.
 */
function sendCheckinShell(res, slug) {
  let html;
  try {
    html = fs.readFileSync(CHECKIN_SHELL, "utf8");
  } catch {
    return res.status(503).type("text").send("Check-in app is not built — run: npm run build:checkin");
  }
  // encodeURIComponent() in manifestHref escapes the quotes and angle brackets a
  // hand-typed slug could otherwise use to break out of the attribute.
  return res.type("html").send(html.replace('href="/checkin/manifest.json"', `href="${manifestHref(slug)}"`));
}

// The installed icon is labelled with the gym's own name, so it has to be read
// here rather than left to the app: the browser wants the manifest before any of
// the app's own fetches have run.
async function checkinAppName(slug) {
  if (!slug) return "Gym Check-in";
  try {
    const gym = await gymModel.getGymBySlug(slug);
    if (!gym || gym.status !== "active") return "Gym Check-in";
    const settings = await repo().getSettings(gym.id);
    return String(settings?.gymName || "").trim() || "Gym Check-in";
  } catch {
    return "Gym Check-in";
  }
}

/**
 * The label under the installed icon. The launcher ellipsizes what doesn't fit, so
 * the gym's own name goes in whole rather than pre-truncated to "Iron Paradis" —
 * only a name long enough to be absurd is cut, and then on a word boundary.
 */
function shortName(name) {
  if (name.length <= 30) return name;
  const cut = name.slice(0, 31);
  const boundary = cut.lastIndexOf(" ");
  return (boundary > 12 ? cut.slice(0, boundary) : name.slice(0, 30)).trim();
}

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
  // and per-gym slugs like /checkin/nova-fitness. `index`/`redirect` off keeps the
  // bare /checkin request out of express.static's hands so it gets the shell below,
  // manifest link and all, rather than the file straight off disk.
  app.use("/checkin", express.static(CHECKIN_DIST, { index: false, redirect: false }));

  // A real, fetchable manifest per gym. Registered before /checkin/:slug, or
  // "manifest.json" would be read as a slug.
  app.get("/checkin/manifest.json", async (req, res) => {
    const slug = String(req.query.slug || "").trim();
    const name = await checkinAppName(slug);
    const startUrl = slug ? `/checkin/${encodeURIComponent(slug)}` : "/checkin";
    res.type("application/manifest+json").json({
      id: startUrl,
      name,
      short_name: shortName(name),
      description: "Quick member check-in for your gym.",
      // The daily ?c= code is deliberately left out of start_url: it expires, the
      // slug doesn't.
      start_url: startUrl,
      // Not "/checkin/": the slug-less start_url is "/checkin", which is outside a
      // trailing-slash scope, and a start_url out of scope makes the whole manifest
      // invalid — the browser then offers no install at all on the bare page.
      scope: "/checkin",
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

  app.get("/checkin", (req, res) => sendCheckinShell(res, ""));
  app.get("/checkin/:slug", (req, res) => sendCheckinShell(res, req.params.slug));

  app.get("/", (req, res) => res.redirect("/admin"));
}

module.exports = mountFrontendRoutes;
