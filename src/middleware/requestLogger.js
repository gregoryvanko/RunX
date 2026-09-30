const { logRequest, clientIp } = require("../services/logger");

const KNOWN_CLIENTS = ["web", "ios"];

// Code enregistré quand la connexion est fermée sans réponse (convention nginx « 444 No Response »)
const NO_RESPONSE = 444;

// Trace chaque appel HTTP (pages, fichiers statiques et API) une fois la réponse envoyée,
// ou à la fermeture de la connexion si aucune réponse n'a été envoyée
function requestLogger(req, res, next) {
  const start = process.hrtime.bigint();
  const header = String(req.get("x-client") || "").toLowerCase();
  req.client_type = KNOWN_CLIENTS.includes(header) ? header : "api";

  let logged = false;
  const done = () => {
    if (logged) return;
    logged = true;
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    const status = res.writableFinished ? res.statusCode : NO_RESPONSE;
    logRequest({
      level: status >= 500 && status !== NO_RESPONSE ? "error" : status >= 400 ? "warn" : "info",
      method: req.method,
      url: req.originalUrl,
      status,
      durationMs: Math.round(durationMs * 10) / 10,
      ip: clientIp(req),
      userAgent: req.get("user-agent"),
      client: req.client_type,
      userId: req.user?._id,
      username: req.user?.username,
    });
  };
  res.on("finish", done);
  res.on("close", done);
  next();
}

module.exports = requestLogger;
