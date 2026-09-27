#!/usr/bin/env bash
# One-time: Sign in with Apple for the website and the iPhone app. Reads the Sign in with Apple key (.p8) itself and
# stores it, its Key ID, the Services ID and the Team ID in .env.local and Vercel: never printed, never committed.
#   just apple-signin-setup ~/Downloads/AuthKey_XXXXXXXXXX.p8
# Before: developer.apple.com → Certificates, Identifiers & Profiles (see docs/APP_STORE.md, "Sign in with Apple").
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/env.sh

key=${1:-}
[ -n "$key" ] || { echo "Pass the Sign in with Apple key: just apple-signin-setup ~/Downloads/AuthKey_XXXXXXXXXX.p8"; ls ~/Downloads/AuthKey_*.p8 2>/dev/null; exit 1; }
[ -f "$key" ] || { echo "No such file: $key"; exit 1; }
grep -q "BEGIN PRIVATE KEY" "$key" || { echo "$key doesn't look like a .p8 key"; exit 1; }
key_id=$(basename "$key" .p8)
key_id=${key_id#AuthKey_}
[[ $key_id =~ ^[A-Z0-9]{10}$ ]] || { echo "Can't read the Key ID from the file name ($key): expected AuthKey_<10 characters>.p8"; exit 1; }

echo "Key ID from the file name: $key_id"
read -rp "Services ID [ch.zettelispiil.signin]: " services
services=${services:-ch.zettelispiil.signin}
read -rp "Team ID [J397AA5G39]: " team
team=${team:-J397AA5G39}

put APPLE_CLIENT_ID "$services"
put APPLE_TEAM_ID "$team"
put APPLE_KEY_ID "$key_id"
put APPLE_PRIVATE_KEY "$(awk '{printf "%s\\n", $0}' "$key")" # one line, breaks as \n (src/lib/auth.ts turns them back)

echo
echo "Done: the next deploy shows Sign in with Apple on the website, and in the iPhone app from its next build on."
echo "Keep $key somewhere safe (a password manager): Apple lets you download it only once."
