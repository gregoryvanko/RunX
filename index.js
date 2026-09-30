const mongoose = require("mongoose");
const config = require("./src/config");
const createApp = require("./src/app");
const seedAdmin = require("./src/seedAdmin");
const { logError } = require("./src/services/logger");

process.on("unhandledRejection", (reason) => {
  logError(reason instanceof Error ? reason : new Error(String(reason)), null, { source: "unhandledRejection" });
});
process.on("uncaughtException", (err) => {
  logError(err, null, { source: "uncaughtException" }).finally(() => process.exit(1));
});

mongoose.connection.on("error", (err) => logError(err, null, { source: "mongodb" }));
mongoose.connection.on("disconnected", () => console.warn("MongoDB déconnecté"));

async function start() {
  await mongoose.connect(config.mongoUri, { dbName: config.mongoDb });
  console.log(`Connecté à MongoDB (${config.mongoDb})`);

  await seedAdmin();

  const app = createApp();
  app.listen(config.port, () => {
    console.log(`Serveur démarré sur http://localhost:${config.port}`);
  });
}

start().catch((err) => {
  console.error("Échec du démarrage :", err);
  process.exit(1);
});
