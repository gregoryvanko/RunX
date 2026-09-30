const jwt = require("jsonwebtoken");
const config = require("../config");
const User = require("../models/User");
const { HttpError } = require("../utils/httpError");

function signToken(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role, tv: user.tokenVersion }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
    algorithm: "HS256",
  });
}

// Vérifie le jeton Bearer et recharge l'utilisateur : un compte supprimé ou un jeton révoqué est refusé
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

    const user = await User.findById(payload.sub);
    if (!user || user.tokenVersion !== payload.tv) throw new HttpError(401, "Session invalide ou expirée");

    req.user = user;
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
