#!/usr/bin/env bash
# Generates (once) and uploads the Android release-signing keystore for GitHub Actions. Passwords are never shown, never
# saved to disk in plain form, and never sent anywhere except as GitHub Actions secrets (encrypted client-side by `gh`).
#
# The keystore itself is a long-lived secret: whoever holds it can sign updates to the Play Store listing forever, and
# losing it means the app can never be updated there again (Play App Signing softens this, but the upload key still
# matters). Keep the private copy this script writes to ./android-release.keystore somewhere safe (a password manager's
# file storage, or an encrypted drive) and never commit it — .gitignore already excludes *.keystore.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/gh-secret.sh

ks=android-release.keystore
if [ -f "$ks" ]; then
  echo "$ks already exists here. Re-run with a different name if you want a fresh one, or delete it first."
  exit 1
fi

echo "Generating a new release keystore (valid 30 years). You'll be asked for a store password and a key password —"
echo "pick two, write them down somewhere safe (a password manager), and never share them."
keytool -genkeypair -v -keystore "$ks" -alias zettelispiil -keyalg RSA -keysize 2048 -validity 10950 \
  -dname "CN=Zettelispiil, OU=Zettelispiil, O=Zettelispiil, L=Zurich, ST=ZH, C=CH"

read -rsp "Store password, once more (to store it on GitHub): " storepass; echo
read -rsp "Key password, once more (to store it on GitHub): " keypass; echo

put_gh ANDROID_KEYSTORE_BASE64 "$(base64 -i "$ks" | tr -d '\n')"
put_gh ANDROID_KEYSTORE_PASSWORD "$storepass"
put_gh ANDROID_KEY_ALIAS "zettelispiil"
put_gh ANDROID_KEY_PASSWORD "$keypass"

cat <<'EOF'
Done. The keystore is on GitHub as a secret (used by .github/workflows/android-release.yml).
Keep the local android-release.keystore file somewhere safe outside this repo — GitHub has a copy, but if you
ever need to reset the GitHub secret you'll want your own backup too. It is gitignored, so it won't be committed.

Still needed before the workflow can publish to the Play Store:
  1. Create the app once in Google Play Console (Zettelispiil, ch.zettelispiil.app) and upload one signed build by hand,
     to get past the store's first-review requirement — GitHub Actions can't do that very first upload.
  2. Play Console → Setup → API access → create a service account, grant it "Release manager", download its JSON key.
  3. Run: just secret-gh PLAY_SERVICE_ACCOUNT_JSON   (paste the JSON's content when asked)
EOF
