const mongoose = require("mongoose");
const config = require("../config");
const { computePerformance } = require("../services/performance");

const ROLES = ["user", "admin"];

// Course « objectif » : mêmes variables qu'une course, sert à tracer l'indice visé sur le graphique
const targetSchema = new mongoose.Schema(
  {
    distanceKm: { type: Number, required: true, min: 0.1, max: 400 },
    durationSec: { type: Number, required: true, min: 60, max: 7 * 86400 },
    avgHeartRate: { type: Number, required: true, min: 40, max: 230 },
    temperatureC: { type: Number, required: true, min: -40, max: 55 },
    elevationGainM: { type: Number, required: true, min: 0, max: 20000 },
  },
  { _id: false }
);

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
    target: { type: targetSchema, default: undefined },
  },
  { timestamps: true }
);

function targetToPublic(target) {
  const { distanceKm, durationSec, avgHeartRate, temperatureC, elevationGainM } = target;
  const { performanceIndex, avgPaceSecPerKm } = computePerformance(target);
  return { distanceKm, durationSec, avgHeartRate, temperatureC, elevationGainM, avgPaceSecPerKm, performanceIndex };
}

userSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    username: this.username,
    displayName: this.displayName,
    role: this.role,
    // Administrateur principal (ADMIN_LOGIN) : compte protégé, ne peut pas être supprimé
    isMainAdmin: this.username === config.adminLogin,
    lastLoginAt: this.lastLoginAt,
    target: this.target ? targetToPublic(this.target) : null,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

module.exports = mongoose.model("User", userSchema);
module.exports.ROLES = ROLES;
