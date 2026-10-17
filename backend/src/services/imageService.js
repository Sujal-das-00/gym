const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { UPLOAD_DIR } = require("../config/constants");

// Per kind of image: the longest side after resizing (largest on-screen use, with a little
// headroom for retina) and the webp quality. Kept small on purpose; these are avatars/logos.
const PROFILES = {
  member: { size: 160, quality: 55, maxBytes: 12 * 1024 },
  logo: { size: 256, quality: 65, maxBytes: 20 * 1024 },
};
const DEFAULT_PROFILE = { size: 160, quality: 55, maxBytes: 12 * 1024 };

const MAX_BASE64_CHARS = 11_200_000; // 8MB of image; the browser normally sends a few KB
const MAX_INPUT_PIXELS = 120_000_000; // decompression-bomb guard; covers 108MP phone cameras
const MAX_CONCURRENT = 2; // image decoding is CPU heavy; never let uploads starve the server
const OWN_UPLOAD = /^\/uploads\/[A-Za-z0-9-]+\.webp$/;

sharp.concurrency(1);
sharp.cache(false);

function reject(message = "Invalid image. Upload a JPEG, PNG or WebP photo.") {
  const error = new Error(message);
  error.status = 400;
  return error;
}

// The real format from the file's own bytes, never from the claimed MIME type or name.
// Only plain raster formats are accepted: no SVG (scripts/external references), no
// TIFF/PDF/HEIF, no animated formats.
function sniff(buf) {
  if (buf.length < 12) return "";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
  return "";
}

let running = 0;
const waiting = [];
async function slot(fn) {
  if (running >= MAX_CONCURRENT) await new Promise((resolve) => waiting.push(resolve));
  running += 1;
  try {
    return await fn();
  } finally {
    running -= 1;
    const next = waiting.shift();
    if (next) next();
  }
}

// Turns an uploaded data URL into a small stored .webp and returns its /uploads path.
// Anything that is not a verified raster image is refused: the stored value is always a
// file this function wrote, so a client can never plant an arbitrary URL, script or path.
async function saveImageData(dataUrl, prefix) {
  if (!dataUrl || typeof dataUrl !== "string") return "";
  // Re-saving a record that already points at one of our own files.
  if (OWN_UPLOAD.test(dataUrl)) return dataUrl;

  const match = dataUrl.length <= MAX_BASE64_CHARS + 100 ? dataUrl.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,([A-Za-z0-9+/]+={0,2})$/) : null;
  if (!match || match[1].length > MAX_BASE64_CHARS) throw reject("Image is too large or not valid. Choose a smaller JPEG, PNG or WebP photo.");

  const input = Buffer.from(match[1], "base64");
  if (!sniff(input)) throw reject();

  const profile = PROFILES[prefix] || DEFAULT_PROFILE;
  let compressed;
  try {
    compressed = await slot(async () => {
      // Re-encode until the stored file is a few KB: drop quality first, then size.
      let size = profile.size;
      let out;
      for (let quality = profile.quality; ; quality -= 10) {
        out = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error", animated: false })
          .rotate() // apply EXIF orientation; all metadata is dropped on re-encode
          .resize({ width: size, height: size, fit: "inside", withoutEnlargement: true })
          .webp({ quality: Math.max(quality, 20), effort: 6, smartSubsample: true })
          .toBuffer();
        if (out.length <= profile.maxBytes || size <= 64) return out;
        if (quality <= 25) {
          size = Math.round(size * 0.75);
          quality = profile.quality + 10;
        }
      }
    });
  } catch {
    throw reject();
  }

  const filename = `${String(prefix).replace(/[^a-z]/g, "") || "img"}-${Date.now()}-${crypto.randomUUID()}.webp`;
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), compressed, { flag: "wx" });
  return `/uploads/${filename}`;
}

module.exports = {
  saveImageData,
};
