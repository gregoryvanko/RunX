const config = require("./config");
const User = require("./models/User");
const { hashPassword, verifyPassword } = require("./utils/password");

// Crée le compte administrateur défini dans .env, ou le resynchronise s'il existe déjà
async function seedAdmin() {
  const existing = await User.findOne({ username: config.adminLogin }).select("+passwordHash");
  if (!existing) {
    await User.create({
      username: config.adminLogin,
      displayName: "Administrateur",
      passwordHash: await hashPassword(config.adminPassword),
      role: "admin",
    });
    console.log(`Admin « ${config.adminLogin} » créé`);
    return;
  }

  let changed = false;
  if (existing.role !== "admin") {
    existing.role = "admin";
    changed = true;
  }
  if (!(await verifyPassword(config.adminPassword, existing.passwordHash))) {
    existing.passwordHash = await hashPassword(config.adminPassword);
    existing.tokenVersion += 1;
    changed = true;
  }
  if (changed) await existing.save();
  console.log(`Admin « ${config.adminLogin} » prêt`);
}

module.exports = seedAdmin;
