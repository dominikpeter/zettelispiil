#!/usr/bin/env bash
# Sets up sign-in (needed for the AI features). Asks for each provider's client ID and secret,
# writes them to .env.local and to Vercel production. Secrets are read silently and never printed.
# Skip a provider by leaving its ID empty. Callback URLs to register with each provider:
#   https://zettelispiil.ch/api/auth/callback/<google|github|microsoft>
#   http://localhost:3000/api/auth/callback/<google|github|microsoft>   (for local dev)
set -euo pipefail
cd "$(dirname "$0")/.."

put() { # put NAME VALUE: replace in .env.local, and set in Vercel production
  touch .env.local
  grep -v "^$1=" .env.local > .env.local.tmp || true
  printf "%s='%s'\n" "$1" "$2" >> .env.local.tmp # single quotes: Next doesn't expand \$ in them && mv .env.local.tmp .env.local
  vercel env rm "$1" production --yes >/dev/null 2>&1 || true
  printf '%s' "$2" | vercel env add "$1" production >/dev/null
  echo "  $1 set"
}

for p in GOOGLE GITHUB MICROSOFT; do
  read -rp "$p client ID (empty to skip): " id
  [ -z "$id" ] && continue
  read -rsp "$p client secret: " secret; echo
  put "${p}_CLIENT_ID" "$id"
  put "${p}_CLIENT_SECRET" "$secret"
done

# keep an existing secret (so sessions stay valid), but always make sure Vercel has the same one
secret=$(grep '^BETTER_AUTH_SECRET=' .env.local 2>/dev/null | cut -d= -f2- | tr -d "'\"" || true)
put BETTER_AUTH_SECRET "${secret:-$(openssl rand -base64 32)}"
vercel env rm BETTER_AUTH_URL production --yes >/dev/null 2>&1 || true
printf 'https://zettelispiil.ch' | vercel env add BETTER_AUTH_URL production >/dev/null && echo "  BETTER_AUTH_URL set"
echo "Done. Redeploy with: just deploy"
