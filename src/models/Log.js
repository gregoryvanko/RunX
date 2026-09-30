const mongoose = require("mongoose");
const config = require("../config");

const logSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["request", "activity", "error"], required: true, index: true },
    level: { type: String, enum: ["info", "warn", "error"], default: "info", index: true },
    message: { type: String, required: true },
    action: { type: String },
    method: { type: String },
    url: { type: String },
    status: { type: Number },
    durationMs: { type: Number },
    ip: { type: String },
    userAgent: { type: String },
    client: { type: String },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    username: { type: String, index: true },
    meta: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

if (config.logRetentionDays > 0) {
  logSchema.index({ createdAt: 1 }, { expireAfterSeconds: config.logRetentionDays * 86400 });
} else {
  logSchema.index({ createdAt: 1 });
}

module.exports = mongoose.model("Log", logSchema);
