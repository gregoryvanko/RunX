const mongoose = require("mongoose");

// Jetons révoqués individuellement (déconnexion d'un seul appareil).
// Chaque entrée est purgée automatiquement par MongoDB à l'expiration naturelle du jeton.
const revokedTokenSchema = new mongoose.Schema(
  {
    jti: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    expiresAt: { type: Date, required: true },
  },
  { versionKey: false }
);

revokedTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("RevokedToken", revokedTokenSchema);
