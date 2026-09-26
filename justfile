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

# deploy the current tree to production
deploy:
    vercel deploy --prod

# full release: checks, e2e, tag, push, GitHub release, deploy. `just release 1.3.0 "notes"`
release version notes: check e2e secrets
    npm version {{version}} --no-git-tag-version --allow-same-version
    git add package.json package-lock.json && git commit -m "release: v{{version}}" || true
    git tag v{{version}}
    git push && git push --tags
    gh release create v{{version}} --title "v{{version}}" --notes {{quote(notes)}}
    just deploy

# OAuth sign-in keys for AI features; prompts for secrets, never echoes them
auth-setup:
    bash scripts/setup-auth.sh

# sign-in with a code by email: asks for the Resend API key (never shown) and the sender address
email-setup:
    bash scripts/setup-email.sh

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

# app icons and splash screens for Android and iOS from assets/*.png
app-icons:
    npx @capacitor/assets generate --iconBackgroundColor '#25003d' --splashBackgroundColor '#f5f1e8' --splashBackgroundColorDark '#1f1d1a'
