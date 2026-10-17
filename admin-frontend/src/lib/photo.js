function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Downscale and re-encode in the browser before upload: the host rejects request
// bodies over ~1MB, and full-resolution photos also make uploads painfully slow.
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_BYTES = 8 * 1024 * 1024; // phone photos are big; they are shrunk below

export async function readPhoto(file, maxDimension = 192, quality = 0.6) {
  // Only plain photos. SVG and anything else can carry scripts, and the server refuses them too.
  if (!file || !ALLOWED_TYPES.includes(file.type)) throw new Error("Choose a JPEG, PNG or WebP photo.");
  if (file.size > MAX_FILE_BYTES) throw new Error("That photo is too large. Choose one under 8 MB.");
  const dataUrl = await readFileAsDataUrl(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      let out = "";
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      out = canvas.toDataURL("image/webp", quality);
      if (!out.startsWith("data:image/webp")) {
        // Browser can't encode webp: keep transparency for logo-like sources, else use jpeg on white.
        if (["image/png", "image/webp"].includes(file.type)) {
          out = canvas.toDataURL("image/png");
        } else {
          ctx.globalCompositeOperation = "destination-over";
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          out = canvas.toDataURL("image/jpeg", quality);
        }
      }
      resolve(out);
    };
    img.onerror = () => reject(new Error("That file is not a valid image."));
    img.src = dataUrl;
  });
}
