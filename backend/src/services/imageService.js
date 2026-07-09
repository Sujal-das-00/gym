const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { UPLOAD_DIR } = require("../config/constants");

function saveImageData(dataUrl, prefix) {
  if (!dataUrl || typeof dataUrl !== "string") return "";
  if (!dataUrl.startsWith("data:image/")) return dataUrl;

  const match = dataUrl.match(/^data:image\/([a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    const error = new Error("Invalid image data");
    error.status = 400;
    throw error;
  }

  const ext = match[1].toLowerCase().replace("jpeg", "jpg").replace(/[^a-z0-9]/g, "");
  const filename = `${prefix}-${Date.now()}-${crypto.randomUUID()}.${ext || "png"}`;
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), Buffer.from(match[2], "base64"));
  return `/uploads/${filename}`;
}

module.exports = {
  saveImageData,
};
