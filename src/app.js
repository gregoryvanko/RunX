const path = require("path");
const express = require("express");
const helmet = require("helmet");
const config = require("./config");
const requestLogger = require("./middleware/requestLogger");
const { requireAuth, requireRole } = require("./middleware/auth");
const { apiNotFound, dropUnknownRoute, errorHandler } = require("./middleware/errorHandler");
const authRoutes = require("./routes/auth");
const meRoutes = require("./routes/me");
const adminRoutes = require("./routes/admin");

function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy);

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          "default-src": ["'self'"],
          "script-src": ["'self'"],
          "style-src": ["'self'"],
          "img-src": ["'self'", "data:"],
          "connect-src": ["'self'"],
          "frame-ancestors": ["'none'"],
          "form-action": ["'self'"],
          "upgrade-insecure-requests": null,
        },
      },
      // Pas de HSTS forcé : l'application tourne en HTTP en développement
      strictTransportSecurity: false,
    })
  );

  app.use(requestLogger);
  app.use(express.json({ limit: "100kb" }));

  // --- API v1 -------------------------------------------------------------
  const api = express.Router();
  api.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  // Routes publiques : uniquement l'inscription et la connexion
  api.use("/auth", authRoutes);

  // Tout ce qui suit exige une authentification
  api.use(requireAuth);
  api.use("/me", meRoutes);
  api.use("/admin", requireRole("admin"), adminRoutes);
  api.use(apiNotFound);

  app.use("/api/v1", api);
  app.use("/api", requireAuth, apiNotFound);

  // --- Interface web ------------------------------------------------------
  const publicDir = path.join(__dirname, "..", "public");
  // L'interface navigue par ancres (#/...) : seule la racine sert index.html, pas de route « fourre-tout »
  app.use(express.static(publicDir, { index: "index.html", redirect: false }));

  // Les navigateurs réclament /favicon.ico d'eux-mêmes (et /favicon.svg pour les pages en cache) :
  // on leur sert l'icône SVG au lieu d'une erreur
  app.get(["/favicon.ico", "/favicon.svg"], (req, res) => {
    res.type("image/svg+xml").set("Cache-Control", "public, max-age=86400").sendFile(path.join(publicDir, "icons", "favicon.svg"));
  });

  // iOS réclame /apple-touch-icon[-NNxNN][-precomposed].png à la racine : taille demandée si elle existe, sinon 180×180
  const appleIconSizes = new Set([57, 60, 72, 76, 114, 120, 144, 152, 167, 180]);
  app.get(/^\/apple-touch-icon(?:-(\d+)x\1)?(?:-precomposed)?\.png$/, (req, res) => {
    const size = appleIconSizes.has(Number(req.params[0])) ? Number(req.params[0]) : 180;
    res.set("Cache-Control", "public, max-age=86400").sendFile(path.join(publicDir, "icons", `apple-touch-icon-${size}x${size}.png`));
  });

  // Toute autre route : journalisée comme erreur, connexion fermée sans réponse
  app.use(dropUnknownRoute);

  app.use(errorHandler);
  return app;
}

module.exports = createApp;
