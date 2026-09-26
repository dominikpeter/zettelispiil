# Zettelispiil tasks. `just` lists them. Every recipe is a thin wrapper around package.json / CLI tools.

default:
    @just --list

# install dependencies and git hooks
setup:
    npm install
    prek install

# dev server with in-memory rooms (no Redis needed)
dev:
    npm run dev

# production build
build:
    npm run build

lint:
    npm run lint

typecheck:
    npx tsc --noEmit

# unit tests (game logic, stats)
test:
    npm test

# e2e against a local production build (port 3217); layout tests run alone, one at a time. Args go to playwright: `just e2e -g drag`
e2e *args:
    #!/usr/bin/env bash
    set -euo pipefail
    if [ -n "{{args}}" ]; then npx playwright test --workers=2 {{args}}; exit; fi
    npx playwright test --workers=2 $(ls e2e/*.spec.ts | grep -v layout) # every spec except the heavy layout one
    npx playwright test --workers=1 e2e/layout.spec.ts

# e2e against the live site
e2e-prod *args:
    BASE_URL=https://zettelispiil.ch just e2e {{args}}

# everything a commit and a release must pass
check: lint typecheck test

# fail if a secret-looking string is in the last commit
secrets:
    ! git log -p -1 | grep -qE "sk-(proj-)?[A-Za-z0-9_-]{20,}|(sk|rk)_(live|test)_[A-Za-z0-9]{20,}|whsec_[A-Za-z0-9]{20,}|re_[A-Za-z0-9]{8}_[A-Za-z0-9]{20,}"

# the version the settings sheet shows (package.json) matches the release tag and GitHub's latest release
version-check:
    bash scripts/check-version.sh

# deploy the current tree to production
deploy:
    vercel deploy --prod

# one-time: give ci.yml's deploy job a Vercel token (asks for it hidden, never echoed) so CI can deploy on its own
vercel-ci-setup:
    bash scripts/setup-vercel-ci.sh

# full release: checks, e2e, tag, push, GitHub release. `just release 1.3.0 "notes"`
# the pushed v-tag triggers .github/workflows/ci.yml, which deploys to Vercel and kicks off the iOS build — not done here,
# so a release only ever deploys once
release version notes: check e2e secrets
    npm version {{version}} --no-git-tag-version --allow-same-version
    git add package.json package-lock.json && git commit -m "release: v{{version}}" || true
    git tag v{{version}}
    just version-check
    git push && git push --tags
    gh release create v{{version}} --title "v{{version}}" --notes {{quote(notes)}}

# store any secret without it ever showing: `just secret NAME` (.env.local + Vercel), `just secret NAME local` (.env.local only)
secret name where="":
    bash scripts/secret.sh {{name}} {{where}}

# OAuth sign-in keys for AI features; prompts for secrets, never echoes them
auth-setup:
    bash scripts/setup-auth.sh

# sign-in with a code by email: asks for the Resend API key (never shown) and the sender address
email-setup:
    bash scripts/setup-email.sh

# a real test-mode payment end to end (card + TWINT on Stripe's test pages, webhook to the app); needs `stripe login`
stripe-e2e *args:
    bash scripts/stripe-e2e.sh {{args}}

# which payment methods the coffee checkout offers right now, and TWINT's approval (read-only, needs `stripe login`)
stripe-check:
    bash scripts/stripe-check.sh

# "buy me a coffee": asks for the Stripe restricted key and webhook secret (never shown); `just stripe-setup local` for .env.local only
stripe-setup *where:
    bash scripts/setup-stripe.sh {{where}}

# phone apps (Capacitor): a native shell around zettelispiil.ch, so web releases reach them without a store update.
# Android needs JDK 21 and the Android SDK (`brew install openjdk@21 android-commandlinetools`); iOS needs Xcode.
export JAVA_HOME := env("JAVA_HOME", "/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home")
export ANDROID_HOME := env("ANDROID_HOME", env("HOME", "") + "/Library/Android/sdk")

# Android test build: android/app/build/outputs/apk/debug/app-debug.apk
android:
    npx cap sync android
    cd android && ./gradlew assembleDebug -q
    @echo "APK: android/app/build/outputs/apk/debug/app-debug.apk"

# install and start the Android test build on a phone connected by USB (USB debugging on)
android-run: android
    $ANDROID_HOME/platform-tools/adb install -r android/app/build/outputs/apk/debug/app-debug.apk
    $ANDROID_HOME/platform-tools/adb shell am start -n ch.zettelispiil.app/.MainActivity

# iOS: sync and open the project in Xcode (build, sign and run from there)
ios:
    npx cap sync ios
    npx cap open ios

# one-time: generate an Android release keystore and store it (and its passwords) as GitHub secrets, for android-release.yml
android-keystore-setup:
    bash scripts/setup-android-keystore.sh

# store any GitHub Actions secret without it ever showing (e.g. PLAY_SERVICE_ACCOUNT_JSON, APPSTORE_PRIVATE_KEY)
secret-gh name:
    bash scripts/secret-gh.sh {{name}}

# app icons and splash screens for Android and iOS from assets/*.png
app-icons:
    npx @capacitor/assets generate --iconBackgroundColor '#25003d' --splashBackgroundColor '#f5f1e8' --splashBackgroundColorDark '#1f1d1a'
