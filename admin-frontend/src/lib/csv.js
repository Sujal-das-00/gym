import { isAppShell, isNativeApp, nativeCall } from "./native.js";

export function downloadCsv(rows, filename) {
  const csv = rows
    .map((row) => row.map((cell) => '"' + String(cell).replaceAll('"', '""') + '"').join(","))
    .join("\n");
  // BOM, so Excel reads ₹ and non-English names as UTF-8 instead of mojibake.
  const text = "\uFEFF" + csv;

  // The phone app's WebView ignores <a download>, so the app shares/saves the file.
  if (isNativeApp()) {
    nativeCall("saveFile", { name: filename, mime: "text/csv", text })
      .then((result) => {
        if (!result?.ok) throw new Error(result?.error || "unsupported");
      })
      .catch(() => alert("Could not export the file. Update the Gym Boo app and try again."));
    return;
  }
  // Older app builds have no bridge: the link below would silently do nothing.
  if (isAppShell()) {
    alert("Update the Gym Boo app from the Play Store to export CSV files.");
    return;
  }

  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking in the same tick can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
