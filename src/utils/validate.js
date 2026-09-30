const { HttpError } = require("./httpError");

const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;

function str(value) {
  return typeof value === "string" ? value : "";
}

function validateUsername(value) {
  const username = str(value).trim().toLowerCase();
  if (!USERNAME_RE.test(username)) {
    throw new HttpError(400, "Identifiant invalide : 3 à 32 caractères parmi a-z, 0-9, « . », « _ », « - »");
  }
  return username;
}

function validatePassword(value) {
  const password = str(value);
  if (password.length < 8 || password.length > 128) {
    throw new HttpError(400, "Le mot de passe doit contenir entre 8 et 128 caractères");
  }
  return password;
}

function validateDisplayName(value, fallback) {
  const name = str(value).trim() || fallback;
  if (!name || name.length > 64) throw new HttpError(400, "Le nom doit contenir entre 1 et 64 caractères");
  return name;
}

module.exports = { validateUsername, validatePassword, validateDisplayName, str };
