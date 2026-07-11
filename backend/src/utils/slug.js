function slugify(value, fallback = "gym") {
  const base = String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  return base || fallback;
}

module.exports = {
  slugify,
};
