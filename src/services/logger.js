const Log = require("../models/Log");

const SENSITIVE_KEYS = /pass(word)?|token|secret|authorization|cookie/i;

// Retire toute donnée sensible avant enregistrement
function sanitize(value, depth = 0) {
  if (value === null || typeof value !== "object" || depth > 4) return value;
  if (Array.isArray(value)) return value.map((v) => sanitize(v, depth + 1));
  const out = {};
  for (const [key, val] of Object.entries(value)) {
    out[key] = SENSITIVE_KEYS.test(key) ? "[masqué]" : sanitize(val, depth + 1);
  }
  return out;
}

function clientIp(req) {
  return String(req.ip || "").replace(/^::ffff:/, "");
}

function requestContext(req) {
  if (!req) return {};
  return {
    method: req.method,
    url: req.originalUrl,
    ip: clientIp(req),
    userAgent: req.get("user-agent"),
    client: req.client_type,
    userId: req.user?._id,
    username: req.user?.username,
  };
}

async function write(entry) {
  // Règle : toute entrée de type « error » a obligatoirement le niveau « error »
  if (entry.type === "error") entry.level = "error";
  try {
    await Log.create(entry);
  } catch (err) {
    // La journalisation ne doit jamais faire tomber une requête
    console.error("[logger] écriture impossible :", err.message);
  }
}

function logRequest(entry) {
  const line = `${entry.method} ${entry.url} ${entry.status} ${entry.durationMs}ms ${entry.username || "-"} ${entry.ip}`;
  console.log(`[request] ${line}`);
  return write({ type: "request", message: line, ...entry });
}

function logActivity(req, action, message, meta, extra = {}) {
  const line = `[${extra.type || "activity"}] ${action} ${message}`;
  if (extra.level === "error") console.error(line);
  else console.log(line);
  return write({
    type: "activity",
    level: extra.level || "info",
    action,
    message,
    ...requestContext(req),
    ...extra,
    meta: meta ? sanitize(meta) : undefined,
  });
}

function logError(err, req, meta) {
  // Stack complète pour les erreurs serveur, message court pour les erreurs client (4xx)
  if (err.status && err.status < 500) console.error(`[error] ${err.status} ${err.message}`);
  else console.error(`[error] ${err.stack || err}`);
  return write({
    type: "error",
    level: "error",
    message: err.message || String(err),
    ...requestContext(req),
    status: err.status,
    meta: sanitize({ ...meta, name: err.name, code: err.code, stack: err.stack }),
  });
}

module.exports = { logRequest, logActivity, logError, sanitize, clientIp };
