require("dotenv").config();

function required(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Variable d'environnement manquante : ${name}`);
  }
  return value.trim();
}

// TRUST_PROXY : "false" (défaut), "true" (= 1 relais) ou un nombre de relais de confiance (ex. 2 = Traefik + cloudflared)
function parseTrustProxy(value) {
  const v = String(value ?? "").trim().toLowerCase();
  if (/^\d+$/.test(v)) return Number(v);
  return v === "true" ? 1 : false;
}

const config = {
  port: Number(process.env.PORT) || 3000,
  mongoUri: process.env.MONGODB_URI || "mongodb://mongo:27017",
  mongoDb: process.env.MONGODB_DB || "RunX",
  adminLogin: required("ADMIN_LOGIN").toLowerCase(),
  adminPassword: required("ADMIN_PASSWORD"),
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "12h",
  logRetentionDays: Number(process.env.LOG_RETENTION_DAYS ?? 90),
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
};

if (config.jwtSecret.length < 32) {
  throw new Error("JWT_SECRET doit contenir au moins 32 caractères.");
}
if (config.adminPassword.length < 8) {
  throw new Error("ADMIN_PASSWORD doit contenir au moins 8 caractères.");
}

module.exports = config;
