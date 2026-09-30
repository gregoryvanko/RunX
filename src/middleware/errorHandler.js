const mongoose = require("mongoose");
const { logError, logActivity } = require("../services/logger");
const { HttpError } = require("../utils/httpError");

function routeNotFoundError(req) {
  return new HttpError(404, `Route inexistante : ${req.method} ${req.originalUrl}`, "ROUTE_NOT_FOUND");
}

// Route web inexistante : on journalise puis on ferme la connexion sans aucune réponse,
// pour ne donner aucune indication à qui teste des URL au hasard
function dropUnknownRoute(req, res) {
  logError(routeNotFoundError(req), req, { response: "connexion fermée sans réponse" });
  req.socket.destroy();
}

// Route API inexistante (appelant authentifié) : erreur 404 JSON, journalisée par errorHandler
function apiNotFound(req, res, next) {
  next(routeNotFoundError(req));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let status = err.status || err.statusCode || 500;
  let message = err.message;

  if (err instanceof mongoose.Error.ValidationError) {
    status = 400;
    message = "Données invalides";
  } else if (err instanceof mongoose.Error.CastError) {
    status = 400;
    message = "Identifiant invalide";
  } else if (err.code === 11000) {
    status = 409;
    message = "Cet identifiant est déjà utilisé";
  } else if (err.type === "entity.parse.failed") {
    status = 400;
    message = "JSON invalide";
  } else if (err.type === "entity.too.large") {
    status = 413;
    message = "Requête trop volumineuse";
  }

  if (err.logged) {
    // déjà journalisé par la route
  } else if (status >= 500) {
    logError(err, req);
    message = "Erreur interne du serveur";
  } else if (status === 401 || status === 403) {
    logActivity(req, status === 401 ? "auth.denied" : "access.denied", `${status} ${req.method} ${req.originalUrl}`, null, {
      level: "warn",
    });
  } else {
    logError(err, req);
  }

  if (err.code === "ROUTE_NOT_FOUND") message = "Ressource introuvable";

  res.status(status).json({ error: message });
}

module.exports = { apiNotFound, dropUnknownRoute, errorHandler };
