const express = require("express");
const rateLimit = require("express-rate-limit");
const User = require("../models/User");
const RevokedToken = require("../models/RevokedToken");
const { hashPassword, verifyPassword } = require("../utils/password");
const { validateUsername, validatePassword, validateDisplayName, str } = require("../utils/validate");
const { HttpError, asyncHandler } = require("../utils/httpError");
const { signToken, requireAuth } = require("../middleware/auth");
const { logActivity } = require("../services/logger");

const router = express.Router();

const limiterOptions = {
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Trop de tentatives, réessayez plus tard" },
};
const loginLimiter = rateLimit({ ...limiterOptions, windowMs: 15 * 60 * 1000, limit: 10, skipSuccessfulRequests: true });
const registerLimiter = rateLimit({ ...limiterOptions, windowMs: 60 * 60 * 1000, limit: 20 });

// Hash factice pour que la durée de réponse ne révèle pas l'existence d'un compte
const dummyHashPromise = hashPassword("runx-dummy-password");

router.post(
  "/register",
  registerLimiter,
  asyncHandler(async (req, res) => {
    const username = validateUsername(req.body?.username);
    const password = validatePassword(req.body?.password);
    const displayName = validateDisplayName(req.body?.displayName, username);

    if (await User.exists({ username })) throw new HttpError(409, "Cet identifiant est déjà utilisé");

    const user = await User.create({
      username,
      displayName,
      passwordHash: await hashPassword(password),
      role: "user",
      lastLoginAt: new Date(),
    });
    req.user = user;
    await logActivity(req, "auth.register", `Création du compte ${username}`);
    res.status(201).json({ token: signToken(user), user: user.toPublic() });
  })
);

router.post(
  "/login",
  loginLimiter,
  asyncHandler(async (req, res) => {
    const username = str(req.body?.username).trim().toLowerCase();
    const password = str(req.body?.password);
    const remember = req.body?.remember === true;

    const user = username ? await User.findOne({ username }).select("+passwordHash") : null;
    const valid = await verifyPassword(password, user ? user.passwordHash : await dummyHashPromise);

    if (!user || !valid) {
      // Un échec d'authentification est journalisé comme une erreur (type et niveau « error »)
      await logActivity(req, "auth.login.failed", `Échec de connexion pour « ${username.slice(0, 64)} »`, null, {
        type: "error",
        level: "error",
        userId: user?._id,
        username: user?.username,
      });
      const err = new HttpError(401, "Identifiant ou mot de passe incorrect");
      err.logged = true;
      throw err;
    }

    user.lastLoginAt = new Date();
    await user.save();
    req.user = user;
    await logActivity(req, "auth.login", `Connexion de ${user.username}${remember ? " (rester connecté)" : ""}`);
    res.json({ token: signToken(user, remember), user: user.toPublic() });
  })
);

router.post(
  "/logout",
  requireAuth,
  asyncHandler(async (req, res) => {
    // Ne ferme que la session de cet appareil : les autres appareils restent connectés
    const { jti, exp } = req.tokenPayload;
    if (jti) {
      await RevokedToken.updateOne(
        { jti },
        { $setOnInsert: { jti, userId: req.user._id, expiresAt: new Date(exp * 1000) } },
        { upsert: true }
      );
    } else {
      // Jeton émis avant l'ajout des identifiants : impossible à révoquer seul, on révoque tout
      req.user.tokenVersion += 1;
      await req.user.save();
    }
    await logActivity(req, "auth.logout", `Déconnexion de ${req.user.username}`);
    res.status(204).end();
  })
);

module.exports = router;
