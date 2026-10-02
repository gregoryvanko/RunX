const express = require("express");
const mongoose = require("mongoose");
const Run = require("../models/Run");
const { computePerformance } = require("../services/performance");
const { HttpError, asyncHandler } = require("../utils/httpError");
const { str } = require("../utils/validate");
const { logActivity } = require("../services/logger");

// Courses de l'utilisateur connecté uniquement : toute requête est filtrée sur req.user._id
const router = express.Router();

// Champs saisissables : [min, max, libellé]
const NUMERIC_FIELDS = {
  distanceKm: [0.1, 400, "La distance (km)"],
  durationSec: [60, 7 * 86400, "La durée (s)"],
  avgHeartRate: [40, 230, "La fréquence cardiaque moyenne (bpm)"],
  temperatureC: [-40, 55, "La température (°C)"],
  elevationGainM: [0, 20000, "Le dénivelé positif (m)"],
};

// partial = true : seuls les champs présents sont validés (PATCH)
function validateRun(body, partial = false) {
  const src = body && typeof body === "object" ? body : {};
  const out = {};

  if (!partial || src.date !== undefined) {
    const date = new Date(str(src.date));
    if (!str(src.date) || isNaN(date)) throw new HttpError(400, "Date invalide (format ISO 8601 attendu)");
    if (date > new Date(Date.now() + 86400000)) throw new HttpError(400, "La date ne peut pas être dans le futur");
    out.date = date;
  }

  for (const [key, [min, max, label]] of Object.entries(NUMERIC_FIELDS)) {
    if (partial && src[key] === undefined) continue;
    const value = typeof src[key] === "string" ? Number(src[key].replace(",", ".")) : src[key];
    if (typeof value !== "number" || !Number.isFinite(value)) throw new HttpError(400, `${label} est obligatoire et doit être un nombre`);
    if (value < min || value > max) throw new HttpError(400, `${label} doit être entre ${min} et ${max}`);
    out[key] = key === "durationSec" || key === "avgHeartRate" || key === "elevationGainM" ? Math.round(value) : value;
  }

  if (src.notes !== undefined) {
    const notes = str(src.notes).trim();
    if (notes.length > 500) throw new HttpError(400, "Les notes sont limitées à 500 caractères");
    out.notes = notes;
  }
  return out;
}

function pagination(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(500, Math.max(1, parseInt(query.limit, 10) || 50));
  return { page, limit, skip: (page - 1) * limit };
}

async function findOwnRun(req) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, "Identifiant invalide");
  const run = await Run.findOne({ _id: req.params.id, userId: req.user._id });
  if (!run) throw new HttpError(404, "Course introuvable");
  return run;
}

// Liste paginée, du plus récent au plus ancien (order=asc pour l'ordre chronologique, utile aux graphiques)
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = pagination(req.query);
    const filter = { userId: req.user._id };
    const from = req.query.from ? new Date(str(req.query.from)) : null;
    const to = req.query.to ? new Date(str(req.query.to)) : null;
    if ((from && !isNaN(from)) || (to && !isNaN(to))) {
      filter.date = {};
      if (from && !isNaN(from)) filter.date.$gte = from;
      if (to && !isNaN(to)) filter.date.$lte = to;
    }
    const dir = str(req.query.order) === "asc" ? 1 : -1;
    const [items, total] = await Promise.all([
      Run.find(filter).sort({ date: dir, _id: dir }).skip(skip).limit(limit),
      Run.countDocuments(filter),
    ]);
    res.json({ items: items.map((r) => r.toPublic()), total, page, limit });
  })
);

// Calcul de l'indice sans enregistrement (aperçu pendant la saisie)
router.post("/preview", (req, res) => {
  const data = validateRun({ date: new Date().toISOString(), ...req.body });
  res.json({ performance: computePerformance(data) });
});

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const run = await Run.create({ ...validateRun(req.body), userId: req.user._id });
    await logActivity(req, "runs.create", `Ajout d'une course de ${run.distanceKm} km`, { runId: run.id });
    res.status(201).json({ run: run.toPublic() });
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    res.json({ run: (await findOwnRun(req)).toPublic() });
  })
);

// PUT remplace tous les champs, PATCH ne modifie que ceux fournis
for (const method of ["put", "patch"]) {
  router[method](
    "/:id",
    asyncHandler(async (req, res) => {
      const run = await findOwnRun(req);
      run.set(validateRun(req.body, method === "patch"));
      await run.save();
      await logActivity(req, "runs.update", `Modification de la course du ${run.date.toISOString().slice(0, 10)}`, { runId: run.id });
      res.json({ run: run.toPublic() });
    })
  );
}

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const run = await findOwnRun(req);
    await run.deleteOne();
    await logActivity(req, "runs.delete", `Suppression de la course du ${run.date.toISOString().slice(0, 10)}`, { runId: run.id });
    res.status(204).end();
  })
);

module.exports = router;
