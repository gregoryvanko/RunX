const express = require("express");
const config = require("../config");
const User = require("../models/User");
const { hashPassword, verifyPassword } = require("../utils/password");
const { validatePassword, validateDisplayName, str } = require("../utils/validate");
const { HttpError, asyncHandler } = require("../utils/httpError");
const { signToken } = require("../middleware/auth");
const { logActivity } = require("../services/logger");
const { deleteUserCascade } = require("../services/userService");
const { validateRun } = require("./runs");

// Données de l'utilisateur connecté uniquement : l'identité vient toujours du jeton (req.user)
const router = express.Router();

router.get("/", (req, res) => {
  res.json({ user: req.user.toPublic() });
});

router.patch(
  "/",
  asyncHandler(async (req, res) => {
    const displayName = validateDisplayName(req.body?.displayName);
    req.user.displayName = displayName;
    await req.user.save();
    await logActivity(req, "profile.update", `Mise à jour du profil de ${req.user.username}`, { displayName });
    res.json({ user: req.user.toPublic() });
  })
);

router.put(
  "/password",
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id).select("+passwordHash");
    if (!(await verifyPassword(str(req.body?.currentPassword), user.passwordHash))) {
      await logActivity(req, "profile.password.failed", "Mot de passe actuel incorrect", null, { level: "warn" });
      throw new HttpError(400, "Mot de passe actuel incorrect");
    }
    user.passwordHash = await hashPassword(validatePassword(req.body?.newPassword));
    user.tokenVersion += 1; // invalide les autres sessions
    await user.save();
    await logActivity(req, "profile.password", `Changement de mot de passe de ${user.username}`);
    res.json({ token: signToken(user, req.tokenRemember), user: user.toPublic() });
  })
);

// Objectif d'indice : mêmes champs qu'une course (sans date ni notes)
router.put(
  "/target",
  asyncHandler(async (req, res) => {
    const { date, notes, ...target } = validateRun({ ...req.body, date: new Date().toISOString(), notes: undefined });
    req.user.target = target;
    await req.user.save();
    const user = req.user.toPublic();
    await logActivity(req, "profile.target", `Objectif d'indice fixé à ${user.target.performanceIndex}`, target);
    res.json({ user });
  })
);

router.delete(
  "/target",
  asyncHandler(async (req, res) => {
    req.user.target = undefined;
    await req.user.save();
    await logActivity(req, "profile.target.delete", "Suppression de l'objectif d'indice");
    res.json({ user: req.user.toPublic() });
  })
);

// Suppression de son propre compte (exigence App Store) : mot de passe requis, données supprimées définitivement
router.delete(
  "/",
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id).select("+passwordHash");
    if (user.username === config.adminLogin) throw new HttpError(400, "Le compte administrateur principal est protégé");
    if (!(await verifyPassword(str(req.body?.password), user.passwordHash))) {
      await logActivity(req, "account.delete.failed", "Suppression du compte refusée : mot de passe incorrect", null, { level: "warn" });
      throw new HttpError(400, "Mot de passe incorrect");
    }
    const deleted = await deleteUserCascade(user._id);
    // Plus aucune trace rattachée au compte : la requête et l'audit sont journalisés sans userId
    req.user = undefined;
    await logActivity(req, "account.delete", `Suppression du compte ${user.username} par son titulaire`, {
      targetUsername: user.username,
      deleted,
    });
    res.status(204).end();
  })
);

module.exports = router;
