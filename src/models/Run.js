const mongoose = require("mongoose");
const { computePerformance } = require("../services/performance");

const runSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    date: { type: Date, required: true },
    distanceKm: { type: Number, required: true, min: 0.1, max: 400 },
    durationSec: { type: Number, required: true, min: 60, max: 7 * 86400 },
    avgHeartRate: { type: Number, required: true, min: 40, max: 230 },
    temperatureC: { type: Number, required: true, min: -40, max: 55 },
    elevationGainM: { type: Number, required: true, min: 0, max: 20000 },
    notes: { type: String, trim: true, maxlength: 500, default: "" },
  },
  { timestamps: true }
);

runSchema.index({ userId: 1, date: -1 });

runSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    date: this.date,
    distanceKm: this.distanceKm,
    durationSec: this.durationSec,
    avgHeartRate: this.avgHeartRate,
    temperatureC: this.temperatureC,
    elevationGainM: this.elevationGainM,
    notes: this.notes,
    ...computePerformance(this),
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

module.exports = mongoose.model("Run", runSchema);
