function dbConfig() {
  if (process.env.DATABASE_URL) {
    return {
      uri: process.env.DATABASE_URL,
      multipleStatements: true,
      waitForConnections: true,
      connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
    };
  }

  return {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "gym_admin",
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
    multipleStatements: true,
  };
}

let cachedJwtSecret = "";

function authConfig() {
  // A stable JWT_SECRET must be set in production. If it is missing we generate a
  // per-process secret so the app still boots — but every restart invalidates
  // existing sessions, so this path warns loudly and should not be relied on.
  let jwtSecret = String(process.env.JWT_SECRET || "").trim();
  if (!jwtSecret) {
    if (!cachedJwtSecret) {
      cachedJwtSecret = require("crypto").randomBytes(48).toString("hex");
      console.warn("JWT_SECRET is not set — using an ephemeral secret. Set JWT_SECRET so sessions survive restarts.");
    }
    jwtSecret = cachedJwtSecret;
  }

  return {
    jwtSecret,
    cookieName: process.env.AUTH_COOKIE_NAME || "gym_session",
    // The super-admin panel uses its own cookie so its session is fully separate
    // from a regular gym-admin session (different interface, no cross-access).
    superCookieName: process.env.SUPER_ADMIN_COOKIE_NAME || "gym_super_session",
    cookieSecure: String(process.env.COOKIE_SECURE || "").toLowerCase() === "true",
    tokenTtlSeconds: Number(process.env.AUTH_TOKEN_TTL || 60 * 60 * 12),
    superAdmin: {
      email: String(process.env.SUPER_ADMIN_EMAIL || "").trim().toLowerCase(),
      password: String(process.env.SUPER_ADMIN_PASSWORD || ""),
      name: String(process.env.SUPER_ADMIN_NAME || "Super Admin").trim() || "Super Admin",
    },
  };
}

function normalizeBaseUrl(value) {
  const trimmed = String(value || "").trim();
  return trimmed.replace(/\/+$/, "");
}

function getPublicBaseUrl(req) {
  const configured = normalizeBaseUrl(process.env.APP_BASE_URL);
  if (configured) return configured;

  const forwardedProto = req.headers["x-forwarded-proto"];
  const protocol = forwardedProto ? String(forwardedProto).split(",")[0].trim() : req.protocol || "http";
  const host = req.headers["x-forwarded-host"] || req.headers.host;

  return `${protocol}://${host || `localhost:${Number(process.env.PORT || 5051)}`}`;
}

module.exports = {
  authConfig,
  dbConfig,
  getPublicBaseUrl,
};
