#!/usr/bin/env bash
# One-time: gives GitHub Actions (ci.yml's deploy job) what it needs to run `vercel deploy` on its own.
# VERCEL_ORG_ID and VERCEL_PROJECT_ID aren't secret (Vercel puts them in every checkout's own .vercel/project.json),
# so this reads them straight from there. VERCEL_TOKEN is the one real secret: asked for hidden, never shown, never
# saved to disk, piped straight into `gh secret set` the same way as `just secret-gh`.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/gh-secret.sh

[ -f .vercel/project.json ] || { echo ".vercel/project.json is missing — run 'vercel link' once first."; exit 1; }
org_id=$(node -p "require('./.vercel/project.json').orgId")
project_id=$(node -p "require('./.vercel/project.json').projectId")

put_gh VERCEL_ORG_ID "$org_id"
put_gh VERCEL_PROJECT_ID "$project_id"

echo "Get a token from https://vercel.com/account/tokens (Create), then paste it here:"
read -rs token
echo
[ -n "$token" ] || { echo "Empty, nothing changed."; exit 1; }
put_gh VERCEL_TOKEN "$token"

echo "Done. ci.yml's deploy job is now ready — the next 'v*' tag push will deploy from GitHub Actions."
