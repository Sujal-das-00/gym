export function downloadCsv(rows, filename) {
  const csv = rows
    .map((row) => row.map((cell) => '"' + String(cell).replaceAll('"', '""') + '"').join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
