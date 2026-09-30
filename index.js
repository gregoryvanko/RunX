const express = require("express");
const mongoose = require("mongoose");

const app = express();
const PORT = 3000;

app.get("/", (req, res) => {
  res.send("Hello Mon Greg depuis le conteneur !");
});

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("Connecté à MongoDB"))
  .catch((err) => console.error("Erreur MongoDB :", err));

app.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
});