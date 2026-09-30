const express = require("express");
const mongoose = require("mongoose");
const config = require("../config");
const User = require("../models/User");
const Log = require("../models/Log");
const { deleteUserCascade } = require("../services/userService");
const { HttpError, asyncHandler } = require("../utils/httpError");
const { str } = require("../utils/validate");
const { logActivity } = require("../services/logger");

// Toutes les routes de ce routeur sont protégées par requireAuth + requireRole("admin") dans app.js
const router = express.Router();

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pagination(query, defaultLimit = 50) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}

async function findTargetUser(id) {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Identifiant invalide");
  const user = await User.findById(id);
  if (!user) throw new HttpError(404, "Utilisateur introuvable");
  return user;
}

// Raison pour laquelle un compte ne peut pas être modifié/supprimé par l'admin courant (null si modifiable)
function protectionReason(req, target) {
  if (target._id.equals(req.user._id)) return "self";
  if (target.username === config.adminLogin) return "main-admin";
  return null;
}

function assertModifiable(req, target) {
  const reason = protectionReason(req, target);
  if (reason === "self") throw new HttpError(400, "Action impossible sur votre propre compte");
  if (reason === "main-admin") throw new HttpError(400, "Le compte administrateur principal est protégé");
}

function toAdminView(req, user) {
  return { ...user.toPublic(), protected: protectionReason(req, user) };
}

router.get(
  "/users",
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = pagination(req.query);
    const filter = {};
    const q = str(req.query.q).trim();
    if (q) {
      const re = new RegExp(escapeRegex(q.slice(0, 64)), "i");
      filter.$or = [{ username: re }, { displayName: re }];
    }
    const [items, total] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      User.countDocuments(filter),
    ]);
    await logActivity(req, "admin.users.list", "Consultation de la liste des utilisateurs", { q, page });
    res.json({ items: items.map((u) => toAdminView(req, u)), total, page, limit });
  })
);

router.get(
  "/users/:id",
  asyncHandler(async (req, res) => {
    const user = await findTargetUser(req.params.id);
    const logCount = await Log.countDocuments({ userId: user._id });
    await logActivity(req, "admin.users.view", `Consultation de l'utilisateur ${user.username}`, { targetId: user.id });
    res.json({ user: toAdminView(req, user), stats: { logCount } });
  })
);

router.patch(
  "/users/:id/role",
  asyncHandler(async (req, res) => {
    const role = str(req.body?.role);
    if (!User.ROLES.includes(role)) throw new HttpError(400, "Rôle invalide");
    const user = await findTargetUser(req.params.id);
    assertModifiable(req, user);
    const previous = user.role;
    user.role = role;
    user.tokenVersion += 1; // force une reconnexion avec les nouveaux droits
    await user.save();
    await logActivity(req, "admin.users.role", `Rôle de ${user.username} : ${previous} → ${role}`, {
      targetId: user.id,
      targetUsername: user.username,
    });
    res.json({ user: user.toPublic() });
  })
);

router.delete(
  "/users/:id",
  asyncHandler(async (req, res) => {
    const user = await findTargetUser(req.params.id);
    assertModifiable(req, user);
    const deleted = await deleteUserCascade(user._id);
    // Trace d'audit conservée (rattachée à l'administrateur, pas à l'utilisateur supprimé)
    await logActivity(req, "admin.users.delete", `Suppression de l'utilisateur ${user.username} et de ses données`, {
      targetId: user.id,
      targetUsername: user.username,
      deleted,
    });
    res.json({ deleted });
  })
);

router.get(
  "/logs",
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = pagination(req.query, 50);
    const filter = {};
    const type = str(req.query.type);
    const level = str(req.query.level);
    const username = str(req.query.username).trim().toLowerCase();
    const q = str(req.query.q).trim();

    if (["request", "activity", "error"].includes(type)) filter.type = type;
    if (["info", "warn", "error"].includes(level)) filter.level = level;
    if (username) filter.username = username.slice(0, 32);
    if (q) {
      const re = new RegExp(escapeRegex(q.slice(0, 100)), "i");
      filter.$or = [{ message: re }, { url: re }, { action: re }];
    }
    const from = req.query.from ? new Date(str(req.query.from)) : null;
    const to = req.query.to ? new Date(str(req.query.to)) : null;
    if ((from && !isNaN(from)) || (to && !isNaN(to))) {
      filter.createdAt = {};
      if (from && !isNaN(from)) filter.createdAt.$gte = from;
      if (to && !isNaN(to)) filter.createdAt.$lte = to;
    }

    const [items, total] = await Promise.all([
      Log.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Log.countDocuments(filter),
    ]);
    res.json({ items, total, page, limit });
  })
);

module.exports = router;
