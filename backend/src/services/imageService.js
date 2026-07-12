const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { UPLOAD_DIR } = require("../config/constants");

const MAX_DIMENSION = 1024; // longest side in px after resize
const WEBP_QUALITY = 70;

async function saveImageData(dataUrl, prefix) {
  if (!dataUrl || typeof dataUrl !== "string") return "";
  if (!dataUrl.startsWith("data:image/")) return dataUrl;

  const match = dataUrl.match(/^data:image\/([a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    const error = new Error("Invalid image data");
    error.status = 400;
    throw error;
  }

  let compressed;
  try {
    compressed = await sharp(Buffer.from(match[2], "base64"))
      .rotate() // apply EXIF orientation before metadata is stripped
      .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
  } catch {
    const error = new Error("Invalid image data");
    error.status = 400;
    throw error;
  }

  const filename = `${prefix}-${Date.now()}-${crypto.randomUUID()}.webp`;
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), compressed);
  return `/uploads/${filename}`;
}

module.exports = {
  saveImageData,
};
