# RunX

RunX est une application web pour coureurs (installable comme une application sur iPhone) qui mesure la progression grâce à un **indice de performance (IPR)** : la vitesse obtenue par battement cardiaque, corrigée du dénivelé et de la température. Deux sorties réalisées dans des conditions différentes (côtes, chaleur, froid) deviennent ainsi comparables, et l'on voit si l'on court plus vite pour le même effort.

### Comment ça marche

1. **Créer un compte** puis se connecter (option « Rester connecté » pour garder la session).
2. **Mes courses** : saisir chaque sortie (date, distance, durée, fréquence cardiaque moyenne, température, dénivelé positif, notes). L'allure et l'indice s'affichent en direct pendant la saisie ; les courses restent modifiables et supprimables.
3. **Performance** (tableau de bord) : indice de la dernière course comparé à la précédente, tendance (moyenne des 5 dernières courses vs les 5 précédentes : progression, stable ou baisse), meilleur indice, nombre de courses, et graphique d'évolution (15, 30 ou toutes les courses). Un **objectif** peut y être fixé en décrivant une course « type » visée : son indice apparaît comme ligne de référence sur le graphique.
4. **Explication** : détail du calcul de l'indice (voir aussi [Indice de performance (IPR)](#indice-de-performance-ipr)).
5. **Mon compte** : nom affiché, mot de passe et suppression définitive du compte.
6. **Administration** (rôle administrateur) : gestion des utilisateurs (rôles, suppression) et consultation des logs.

Côté technique : Node.js (Express + Mongoose + MongoDB), authentification JWT, rôles Administrateur / Utilisateur, journalisation complète et une [API REST v1](#api-v1-pour-lapplication-ios) prête pour une application iOS.

## Pages publiques (App Store)

Accessibles sans connexion, avec ou sans l'extension `.html` (style : `public/css/site.css`) :

| Page | URL | Usage App Store Connect |
|---|---|---|
| Présentation | `/about` | URL marketing |
| Support | `/support` | URL d'assistance |
| Confidentialité | `/privacy` | URL de la politique de confidentialité |

## Démarrage

1. Ouvrir le projet dans le devcontainer (`.devcontainer/`) : il démarre Node 22 et MongoDB (`mongodb://mongo:27017`).
2. Copier `.env.example` en `.env` et renseigner au minimum `ADMIN_LOGIN`, `ADMIN_PASSWORD` (≥ 8 caractères) et `JWT_SECRET` (≥ 32 caractères).
3. `npm install` puis `npm run dev` (ou `npm start`).
4. Ouvrir http://localhost:3000.

Au démarrage, le compte administrateur défini dans `.env` est créé (ou son mot de passe resynchronisé). La base utilisée est `RunX`.

| Variable | Défaut | Rôle |
|---|---|---|
| `PORT` | `3000` | Port HTTP |
| `MONGODB_URI` | `mongodb://mongo:27017` | Serveur MongoDB |
| `MONGODB_DB` | `RunX` | Nom de la base |
| `ADMIN_LOGIN` / `ADMIN_PASSWORD` | — | Compte administrateur |
| `JWT_SECRET` | — | Secret de signature des jetons |
| `JWT_EXPIRES_IN` | `12h` | Durée de validité d'un jeton |
| `JWT_REMEMBER_EXPIRES_IN` | `7d` | Durée de validité d'un jeton avec « Rester connecté » (session conservée à la fermeture du navigateur) |
| `LOG_RETENTION_DAYS` | `90` | Purge automatique des logs (0 = jamais) |
| `TRUST_PROXY` | `false` | Nombre de relais de confiance devant l'application (IP réelle dans les logs et pour le limiteur de connexions) : `true`/`1` = un reverse proxy, `2` = Traefik + tunnel Cloudflare |

### Derrière Traefik et un tunnel Cloudflare

Pour voir l'IP publique réelle du visiteur :
1. Traefik doit faire confiance à `cloudflared`, sinon il écrase `X-Forwarded-For` : ajouter `--entrypoints.websecure.forwardedHeaders.trustedIPs=<réseau de cloudflared>` (jamais `0.0.0.0/0`).
2. Mettre `TRUST_PROXY=2` (Traefik + cloudflared). Depuis le réseau local (un seul relais), l'IP reste correcte.

## Sécurité

- Mots de passe hachés avec `scrypt` (sel aléatoire).
- Jetons JWT (HS256) transmis via `Authorization: Bearer <jeton>` ; aucune route `/api` n'est accessible sans jeton, sauf l'inscription et la connexion.
- Chaque requête recharge l'utilisateur : un compte supprimé, un rôle modifié, une déconnexion ou un changement de mot de passe invalident immédiatement les jetons existants.
- Limitation des tentatives de connexion (10 échecs / 15 min / IP) et d'inscription.
- En-têtes de sécurité via `helmet` avec une CSP stricte ; l'interface n'injecte jamais de HTML.
- Les mots de passe et jetons ne sont jamais écrits dans les logs.

## Journalisation

Collection `logs` de la base `RunX`, consultable par l'administrateur (menu **Logs**) :

- `request` : chaque appel HTTP (méthode, URL, statut, durée, IP, user-agent, client, utilisateur) ;
- `activity` : inscriptions, connexions (réussies ou non), déconnexions, modifications de profil, actions d'administration, accès refusés ;
- `error` : erreurs applicatives, erreurs MongoDB, exceptions non gérées.

## API v1 (pour l'application iOS)

Base : `/api/v1`. Corps et réponses en JSON. Erreurs : `{ "error": "message" }` avec le code HTTP adapté (400, 401, 403, 404, 409, 429, 500).
Envoyer l'en-tête `X-Client: ios` pour que les appels soient identifiés comme tels dans les logs.

| Méthode | Route | Accès | Description |
|---|---|---|---|
| POST | `/auth/register` | public | `{ username, password, displayName? }` → `201 { token, user }` |
| POST | `/auth/login` | public | `{ username, password }` → `{ token, user }` |
| POST | `/auth/logout` | connecté | Révoque le jeton utilisé (les autres appareils restent connectés) → `204` |
| GET | `/me` | connecté | `{ user }` |
| PATCH | `/me` | connecté | `{ displayName }` → `{ user }` |
| DELETE | `/me` | connecté | `{ password }` : supprime définitivement le compte et toutes ses données (sauf administrateur principal) → `204` |
| PUT | `/me/password` | connecté | `{ currentPassword, newPassword }` → `{ token, user }` (nouveau jeton) |
| PUT | `/me/target` | connecté | Objectif d'indice : `{ distanceKm, durationSec, avgHeartRate, temperatureC, elevationGainM }` → `{ user }` |
| DELETE | `/me/target` | connecté | Supprime l'objectif → `{ user }` |
| GET | `/runs?order=&from=&to=&page=&limit=` | connecté | Courses de l'utilisateur, plus récentes d'abord (`order=asc` : chronologique ; `limit` ≤ 500) → `{ items, total, page, limit }` |
| POST | `/runs` | connecté | `{ date, distanceKm, durationSec, avgHeartRate, temperatureC, elevationGainM, notes? }` → `201 { run }` |
| POST | `/runs/preview` | connecté | Mêmes champs (sans `date`) : calcule l'indice sans enregistrer → `{ performance }` |
| GET | `/runs/:id` | connecté | `{ run }` |
| PUT / PATCH | `/runs/:id` | connecté | PUT : tous les champs ; PATCH : seulement ceux fournis → `{ run }` |
| DELETE | `/runs/:id` | connecté | `204` |
| GET | `/admin/users?q=&page=&limit=` | admin | `{ items, total, page, limit }` |
| GET | `/admin/users/:id` | admin | `{ user, stats }` |
| PATCH | `/admin/users/:id/role` | admin | `{ role: "user" \| "admin" }` → `{ user }` |
| DELETE | `/admin/users/:id` | admin | Supprime l'utilisateur et toutes ses données → `{ deleted }` |
| GET | `/admin/logs?type=&level=&username=&q=&from=&to=&page=&limit=` | admin | `{ items, total, page, limit }` |

Objet `user` : `{ id, username, displayName, role, lastLoginAt, target, createdAt, updatedAt }` ; `target` vaut `null` ou les champs saisis + `{ avgPaceSecPerKm, performanceIndex }` (même formule que les courses).

Objet `run` : champs saisis (`date` ISO 8601, `distanceKm` 0,1–400, `durationSec` 60–604800, `avgHeartRate` 40–230, `temperatureC` −40–55, `elevationGainM` 0–20000, `notes` ≤ 500 car.) + valeurs calculées `{ avgPaceSecPerKm, avgSpeedKmh, effortKm, gradeAdjustedPaceSecPerKm, temperatureFactor, performanceIndex, formulaVersion }` + `{ id, createdAt, updatedAt }`. Chaque utilisateur n'accède qu'à ses propres courses.

### Indice de performance (IPR)

Efficacité de course : vitesse obtenue par battement cardiaque, corrigée du terrain et de la météo (`src/services/performance.js`).

```
IPR = 100 × vitesse équivalente plat (m/min) × facteur température ÷ FC moyenne
```

- **Dénivelé** : distance « kilomètre-effort » = distance + D+ / 100 (100 m de D+ ≈ 1 km à plat).
- **Température** : +0,4 % par °C au-dessus de 12 °C, +0,2 % par °C en dessous de 5 °C (la chaleur et le froid font monter le cœur).
- Une allure plus rapide obtenue au prix d'une FC proportionnellement plus élevée fait **baisser** l'indice.
- Repère : 10 km en 50 min à plat, 15 °C, 150 bpm → IPR ≈ 135.

L'indice est calculé à la lecture : une évolution de la formule s'applique à tout l'historique (`formulaVersion` l'indique). Le tableau de bord compare la moyenne des 5 dernières courses aux 5 précédentes (progression au-delà de +1,5 %, baisse en deçà de −1,5 %).

Exemple :

```bash
TOKEN=$(curl -s -X POST localhost:3000/api/v1/auth/login -H 'Content-Type: application/json' \
  -d '{"username":"alice","password":"motdepasse"}' | jq -r .token)
curl -s localhost:3000/api/v1/me -H "Authorization: Bearer $TOKEN" -H 'X-Client: ios'
```

## Ajouter des données utilisateur

Tout nouveau modèle rattaché à un utilisateur doit porter un champ `userId` et être ajouté à `USER_OWNED_MODELS` dans `src/services/userService.js`, afin d'être supprimé avec le compte.
