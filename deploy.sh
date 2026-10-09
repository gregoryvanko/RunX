#!/usr/bin/env bash
set -euo pipefail

IMAGE="docker.io/gregoryvanko/runx:latest"
SERVER="gregory@192.168.40.40"
COMPOSE_DIR="/Docker-Stacks"

echo "▶ Build"
docker buildx build --platform linux/amd64 -t "$IMAGE" --load .

echo "▶ Push"
docker push "$IMAGE"

# Script exécuté sur le serveur (liste, choix, déploiement)
REMOTE_SCRIPT=$(cat <<'EOF'
set -euo pipefail
BASE="$1"
cd "$BASE"

mapfile -t DIRS < <(find . -mindepth 1 -maxdepth 1 -type d ! -name '.*' -printf '%f\n' | sort)
if [ "${#DIRS[@]}" -eq 0 ]; then
  echo "Aucun sous-dossier trouvé dans $BASE"
  exit 1
fi

echo
echo "Dossiers disponibles dans $BASE :"
for i in "${!DIRS[@]}"; do
  printf '  %d) %s\n' "$((i+1))" "${DIRS[$i]}"
done
echo

read -rp "Numéro du dossier à déployer : " N
if ! [[ "$N" =~ ^[0-9]+$ ]] || [ "$N" -lt 1 ] || [ "$N" -gt "${#DIRS[@]}" ]; then
  echo "Choix invalide"
  exit 1
fi

TARGET="${DIRS[$((N-1))]}"
echo "▶ Déploiement dans $BASE/$TARGET"
cd "$TARGET"

docker compose pull && docker compose up -d && docker image prune -f
EOF
)

# Encodage en base64 pour éviter tout problème de guillemets
B64=$(printf '%s' "$REMOTE_SCRIPT" | base64 | tr -d '\n')

echo "▶ Connexion au serveur (mot de passe SSH demandé)"
ssh -t "$SERVER" "bash -c \"\$(echo $B64 | base64 -d)\" _ '$COMPOSE_DIR'"

echo "▶ Nettoyage local"
docker image prune -f

echo "✔ Terminé"