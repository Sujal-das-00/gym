const express = require("express");
const fs = require("fs");
const path = require("path");
const {
  ADMIN_DIST,
  ASSET_LINKS_PATH,
  SUPERADMIN_DIR,
  CHECKIN_DIST,
  ICONS_DIR,
  PROJECT_ROOT,
  UPLOAD_DIR,
} = require("../config/constants");
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

/**
 * Digital Asset Links — what makes the Android app drop the URL bar.
 *
 * An APK wrapping this site (a Trusted Web Activity, which is what PWABuilder and
 * Bubblewrap produce) shows the address bar on every screen until Chrome can prove
 * the app and the site belong to the same owner. It proves it by fetching
 * /.well-known/assetlinks.json and finding the app's package name and signing
 * fingerprint in it. Unverified, the app still works — it just never looks like an
 * app.
 *
 * Edit .well-known/assetlinks.json (its README explains where the two values come
 * from). Placeholders still in place count as "not filled in yet", so a half-done
 * file is never served as if it were real — the .env pair below is used instead.
 */
function readAssetLinksFile() {
  let raw;
  try {
    raw = fs.readFileSync(ASSET_LINKS_PATH, "utf8");
  } catch {
    return null; // No file — fall back to the environment.
  }
  if (raw.includes("REPLACE_WITH")) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return { error: `.well-known/assetlinks.json is not valid JSON: ${error.message}` };
  }
}

/**
 * The same two values out of .env, for a deployment that would rather configure
 * them than edit a file:
 *   TWA_PACKAGE_NAME=com.toolszila.gymbot
 *   TWA_SHA256_FINGERPRINT=AB:CD:...
 * List several fingerprints comma-separated — with Play App Signing the upload key
 * and the Play signing key are different, and both have to be in here.
 */
function readAssetLinksEnv() {
  const packageName = String(process.env.TWA_PACKAGE_NAME || "").trim();
  const fingerprints = String(process.env.TWA_SHA256_FINGERPRINT || "")
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
  if (!packageName || !fingerprints.length) return null;
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: packageName,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];
}

function mountFrontendRoutes(app) {
  // Ahead of express.static, which ignores dot-directories and would answer 404
  // for anything under /.well-known.
  app.get("/.well-known/assetlinks.json", (req, res) => {
    const fromFile = readAssetLinksFile();
    if (fromFile?.error) return res.status(500).json({ error: fromFile.error });
    const links = fromFile || readAssetLinksEnv();
    if (!links) {
      return res.status(404).json({
        error:
          "No Android app configured — fill in .well-known/assetlinks.json, or set TWA_PACKAGE_NAME and TWA_SHA256_FINGERPRINT.",
      });
    }
    // Chrome insists on application/json here; anything else fails verification.
    return res.type("application/json").json(links);
  });

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
