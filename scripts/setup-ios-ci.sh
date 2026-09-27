#!/usr/bin/env bash
# One-time: hands GitHub Actions (ios-release.yml) what it needs to sign the iOS app and upload it to TestFlight.
# Reads the App Store Connect API key (.p8) itself and pipes it straight into `gh secret set`: it is never printed,
# never copied, never committed. The Key ID comes from the file name (AuthKey_<KEYID>.p8); you only type the Issuer ID.
#   just ios-ci-setup                                  (finds ~/Downloads/AuthKey_*.p8)
#   just ios-ci-setup ~/Downloads/AuthKey_ABC123.p8
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/gh-secret.sh

key=${1:-}
if [ -z "$key" ]; then
  shopt -s nullglob
  found=(~/Downloads/AuthKey_*.p8)
  [ ${#found[@]} -eq 1 ] || { echo "Pass the key file: just ios-ci-setup path/to/AuthKey_XXXX.p8 (found ${#found[@]} in ~/Downloads)"; exit 1; }
  key=${found[0]}
fi
[ -f "$key" ] || { echo "No such file: $key"; exit 1; }
grep -q "BEGIN PRIVATE KEY" "$key" || { echo "$key doesn't look like an App Store Connect API key (.p8)"; exit 1; }

key_id=$(basename "$key" .p8)
key_id=${key_id#AuthKey_}
[[ $key_id =~ ^[A-Z0-9]{10}$ ]] || { echo "Can't read the Key ID from the file name ($key): expected AuthKey_<10 characters>.p8"; exit 1; }

echo "Key ID from the file name: $key_id"
echo "Issuer ID: App Store Connect → Users and Access → Integrations → App Store Connect API, shown above the keys."
read -rp "Issuer ID: " issuer
[[ $issuer =~ ^[0-9a-f-]{36}$ ]] || { echo "That doesn't look like an Issuer ID (a UUID like 57246542-96fe-1a63-e053-0824d011072a)"; exit 1; }
read -rp "Team ID [J397AA5G39]: " team
team=${team:-J397AA5G39}

put_gh APPSTORE_KEY_ID "$key_id"
put_gh APPSTORE_ISSUER_ID "$issuer"
put_gh APPLE_TEAM_ID "$team"
put_gh APPSTORE_PRIVATE_KEY "$(cat "$key")"
gh variable set IOS_SIGNING_READY --body true >/dev/null
echo "  IOS_SIGNING_READY=true set on GitHub"

echo
echo "Done: the next release (or: gh workflow run ios-release.yml) signs the app and uploads it to TestFlight."
echo "Keep $key somewhere safe (a password manager): Apple lets you download it only once."
