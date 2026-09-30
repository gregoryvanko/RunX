# RunX

Application web Node.js (Express + Mongoose + MongoDB) avec authentification, rôles Administrateur / Utilisateur, journalisation complète et une API REST prête pour une application iOS.

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
| `LOG_RETENTION_DAYS` | `90` | Purge automatique des logs (0 = jamais) |
| `TRUST_PROXY` | `false` | `true` derrière un reverse proxy (IP réelle dans les logs) |

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
| POST | `/auth/logout` | connecté | Révoque les jetons de l'utilisateur → `204` |
| GET | `/me` | connecté | `{ user }` |
| PATCH | `/me` | connecté | `{ displayName }` → `{ user }` |
| PUT | `/me/password` | connecté | `{ currentPassword, newPassword }` → `{ token, user }` (nouveau jeton) |
| GET | `/admin/users?q=&page=&limit=` | admin | `{ items, total, page, limit }` |
| GET | `/admin/users/:id` | admin | `{ user, stats }` |
| PATCH | `/admin/users/:id/role` | admin | `{ role: "user" \| "admin" }` → `{ user }` |
| DELETE | `/admin/users/:id` | admin | Supprime l'utilisateur et toutes ses données → `{ deleted }` |
| GET | `/admin/logs?type=&level=&username=&q=&from=&to=&page=&limit=` | admin | `{ items, total, page, limit }` |

Objet `user` : `{ id, username, displayName, role, lastLoginAt, createdAt, updatedAt }`.

Exemple :

```bash
TOKEN=$(curl -s -X POST localhost:3000/api/v1/auth/login -H 'Content-Type: application/json' \
  -d '{"username":"alice","password":"motdepasse"}' | jq -r .token)
curl -s localhost:3000/api/v1/me -H "Authorization: Bearer $TOKEN" -H 'X-Client: ios'
```

## Ajouter des données utilisateur

Tout nouveau modèle rattaché à un utilisateur doit porter un champ `userId` et être ajouté à `USER_OWNED_MODELS` dans `src/services/userService.js`, afin d'être supprimé avec le compte.
