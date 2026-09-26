#!/usr/bin/env bash
# Stores one secret: `just secret NAME` asks for its value without showing it and writes it to .env.local and Vercel production
# (as a sensitive variable). `just secret NAME local`: .env.local only. The value never appears on screen, in history or in logs,
# so an agent can start this for you and store a key it never sees.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/env.sh
name=${1:-}
[[ $name =~ ^[A-Z][A-Z0-9_]*$ ]] || { echo "usage: just secret NAME [local]   (NAME in CAPITALS, e.g. STRIPE_SECRET_KEY)"; exit 1; }
[ "${2:-}" = local ] && export LOCAL_ONLY=1
read -rsp "$name (hidden, paste and press Enter): " value; echo
[ -n "$value" ] || { echo "Empty, nothing changed."; exit 1; }
put "$name" "$value"
if [ "${LOCAL_ONLY:-}" = 1 ]; then echo "Done, .env.local only."; else echo "Done. Redeploy with: just deploy"; fi
