function parseCookies(req) {
  const header = req.headers && req.headers.cookie;
  const out = {};
  if (!header) return out;
  for (const part of String(header).split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    if (!key) continue;
    out[key] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return out;
}

function buildSetCookie(name, value, options = {}) {
  const { maxAge, secure, httpOnly = true, sameSite = "Lax", path = "/" } = options;
  const segments = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`, `SameSite=${sameSite}`];
  if (httpOnly) segments.push("HttpOnly");
  if (secure) segments.push("Secure");
  if (typeof maxAge === "number") segments.push(`Max-Age=${Math.floor(maxAge)}`);
  return segments.join("; ");
}

function clearCookie(name, options = {}) {
  return buildSetCookie(name, "", { ...options, maxAge: 0 });
}

module.exports = {
  parseCookies,
  buildSetCookie,
  clearCookie,
};
