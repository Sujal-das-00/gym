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
export async function readPhoto(file, maxDimension = 256, quality = 0.8) {
  const dataUrl = await readFileAsDataUrl(file);
  return new Promise((resolve) => {
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
        if (["image/png", "image/webp", "image/gif", "image/svg+xml"].includes(file.type)) {
          out = canvas.toDataURL("image/png");
        } else {
          ctx.globalCompositeOperation = "destination-over";
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          out = canvas.toDataURL("image/jpeg", quality);
        }
      }
      resolve(out.length < dataUrl.length ? out : dataUrl);
    };
    img.onerror = () => resolve(dataUrl); // not decodable here; the server will validate it
    img.src = dataUrl;
  });
}
