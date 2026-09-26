#!/usr/bin/env bash
# Sets up sign-in (needed for the AI features). Asks for each provider's client ID and secret,
# writes them to .env.local and to Vercel production. Secrets are read silently and never printed.
# Skip a provider by leaving its ID empty. For Google you can give the path to the downloaded client JSON instead. Callback URLs to register with each provider:
#   https://zettelispiil.ch/api/auth/callback/<google|github|microsoft>
#   http://localhost:3000/api/auth/callback/<google|github|microsoft>   (for local dev)
set -euo pipefail
cd "$(dirname "$0")/.."

source scripts/env.sh

for p in GOOGLE GITHUB MICROSOFT; do
  read -rp "$p client ID, or the path to Google's downloaded client JSON (empty to skip): " id
  [ -z "$id" ] && continue
  id="${id/#\~/$HOME}"; id="${id%\"}"; id="${id#\"}"; id="${id%\'}"; id="${id#\'}" # ~ and quotes from drag-and-drop
  if [ -f "$id" ]; then # Google's JSON: take both values from the file, never shown
    secret=$(jq -r '.web.client_secret' "$id")
    id=$(jq -r '.web.client_id' "$id")
  else
    read -rsp "$p client secret: " secret; echo
  fi
  put "${p}_CLIENT_ID" "$id"
  put "${p}_CLIENT_SECRET" "$secret"
done

# keep an existing secret (so sessions stay valid), but always make sure Vercel has the same one
secret=$(grep '^BETTER_AUTH_SECRET=' .env.local 2>/dev/null | cut -d= -f2- | tr -d "'\"" || true)
put BETTER_AUTH_SECRET "${secret:-$(openssl rand -base64 32)}"
vercel env rm BETTER_AUTH_URL production --yes >/dev/null 2>&1 || true
printf 'https://zettelispiil.ch' | vercel env add BETTER_AUTH_URL production >/dev/null && echo "  BETTER_AUTH_URL set"
echo "Done. Redeploy with: just deploy"
