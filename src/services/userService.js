const User = require("../models/User");
const Log = require("../models/Log");

// Modèles contenant des données rattachées à un utilisateur (champ userId).
// Ajouter ici tout futur modèle RunX pour qu'il soit purgé à la suppression du compte.
const USER_OWNED_MODELS = [Log];

async function deleteUserCascade(userId) {
  const deleted = {};
  for (const model of USER_OWNED_MODELS) {
    const res = await model.deleteMany({ userId });
    deleted[model.modelName] = res.deletedCount;
  }
  const res = await User.deleteOne({ _id: userId });
  deleted.User = res.deletedCount;
  return deleted;
}

module.exports = { deleteUserCascade, USER_OWNED_MODELS };
