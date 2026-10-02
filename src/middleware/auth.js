const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const config = require("../config");
const User = require("../models/User");
const RevokedToken = require("../models/RevokedToken");
const { HttpError } = require("../utils/httpError");

// remember = true : jeton longue durée (option « Rester connecté »)
function signToken(user, remember = false) {
  const payload = { sub: user._id.toString(), role: user.role, tv: user.tokenVersion };
  if (remember) payload.rem = true;
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: remember ? config.jwtRememberExpiresIn : config.jwtExpiresIn,
    algorithm: "HS256",
    jwtid: crypto.randomUUID(), // identifiant unique : permet de révoquer ce seul jeton (déconnexion d'un appareil)
  });
}

// Vérifie le jeton Bearer et recharge l'utilisateur : un compte supprimé ou un jeton révoqué est refusé
// (révocation globale via tokenVersion, ou individuelle via la liste des jetons révoqués)
async function requireAuth(req, res, next) {
  try {
    const [scheme, token] = String(req.get("authorization") || "").split(" ");
    if (scheme !== "Bearer" || !token) throw new HttpError(401, "Authentification requise");

    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] });
    } catch {
      throw new HttpError(401, "Session invalide ou expirée");
    }

    const [user, revoked] = await Promise.all([
      User.findById(payload.sub),
      payload.jti ? RevokedToken.exists({ jti: payload.jti }) : null,
    ]);
    if (!user || user.tokenVersion !== payload.tv || revoked) throw new HttpError(401, "Session invalide ou expirée");

    req.user = user;
    req.tokenRemember = payload.rem === true;
    req.tokenPayload = payload;
    next();
  } catch (err) {
    next(err);
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return next(new HttpError(403, "Accès refusé"));
    next();
  };
}

module.exports = { signToken, requireAuth, requireRole };
