const express = require("express");
const User = require("../models/User");
const { hashPassword, verifyPassword } = require("../utils/password");
const { validatePassword, validateDisplayName, str } = require("../utils/validate");
const { HttpError, asyncHandler } = require("../utils/httpError");
const { signToken } = require("../middleware/auth");
const { logActivity } = require("../services/logger");

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
    res.json({ token: signToken(user), user: user.toPublic() });
  })
);

module.exports = router;
