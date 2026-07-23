#!/usr/bin/env bash
# Seed the first admin user.
#   ./scripts/seed-admin.sh "Ada Lovelace" ada@example.com          # local dev DB
#   ./scripts/seed-admin.sh "Ada Lovelace" ada@example.com --remote # production
set -euo pipefail

NAME="${1:?usage: seed-admin.sh NAME EMAIL [--remote]}"
EMAIL="${2:?usage: seed-admin.sh NAME EMAIL [--remote]}"
TARGET="${3:---local}"

ID=$(uuidgen | tr '[:upper:]' '[:lower:]')
SQL="INSERT INTO employees (id, name, email, role) VALUES ('$ID', '$NAME', lower('$EMAIL'), 'admin');"

npx wrangler d1 execute ledger-db "$TARGET" --command "$SQL"
echo "Seeded admin: $NAME <$EMAIL>"
