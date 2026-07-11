const crypto = require("crypto");

// Minimal, self-contained HS256 JWT (base64url header.payload.signature).
// Keeps the project dependency-free; verification is constant-time.
function base64url(buffer) {
  return Buffer.from(buffer)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64urlJson(value) {
  return base64url(JSON.stringify(value));
}

function decodeSegment(segment) {
  return Buffer.from(String(segment).replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function signPart(data, secret) {
  return base64url(crypto.createHmac("sha256", secret).update(data).digest());
}

function sign(payload, secret, expiresInSeconds = 60 * 60 * 12) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64urlJson({ alg: "HS256", typ: "JWT" });
  const body = base64urlJson({ ...payload, iat: now, exp: now + Number(expiresInSeconds) });
  const data = `${header}.${body}`;
  return `${data}.${signPart(data, secret)}`;
}

function verify(token, secret) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts;
  const expected = signPart(`${header}.${body}`, secret);
  const actualBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (actualBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(actualBuf, expectedBuf)) {
    return null;
  }
  let payload;
  try {
    payload = JSON.parse(decodeSegment(body));
  } catch {
    return null;
  }
  if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) return null;
  return payload;
}

module.exports = {
  sign,
  verify,
};
