#!/usr/bin/env bash
# Stores one GitHub Actions secret without it ever showing: `just secret-gh NAME` asks for its value hidden and pipes it
# straight into `gh secret set`. The value never appears on screen, in shell history or in any log, so an agent can
# start this for you and store a key it never sees.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/gh-secret.sh
name=${1:-}
[[ $name =~ ^[A-Z][A-Z0-9_]*$ ]] || { echo "usage: just secret-gh NAME   (NAME in CAPITALS, e.g. PLAY_SERVICE_ACCOUNT_JSON)"; exit 1; }
echo "Paste the value, then press Enter. For a multi-line secret (a JSON key file), paste it all, then Ctrl-D on its own line."
value=$(cat)
[ -n "$value" ] || { echo "Empty, nothing changed."; exit 1; }
put_gh "$name" "$value"
