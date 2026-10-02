const mongoose = require("mongoose");

const ROLES = ["user", "admin"];

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /^[a-z0-9._-]{3,32}$/,
    },
    displayName: { type: String, required: true, trim: true, maxlength: 64 },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: "user" },
    // Incrémenté au changement de mot de passe ou de rôle pour invalider tous les jetons existants
    tokenVersion: { type: Number, default: 0 },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

userSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    username: this.username,
    displayName: this.displayName,
    role: this.role,
    lastLoginAt: this.lastLoginAt,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

module.exports = mongoose.model("User", userSchema);
module.exports.ROLES = ROLES;
