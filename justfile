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
    npx playwright test --workers=2 e2e/game.spec.ts e2e/auth.spec.ts
    npx playwright test --workers=1 e2e/layout.spec.ts

# e2e against the live site
e2e-prod *args:
    BASE_URL=https://zettelispiil.ch just e2e {{args}}

# everything a commit and a release must pass
check: lint typecheck test

# fail if a secret-looking string is in the last commit
secrets:
    ! git log -p -1 | grep -qE "sk-(proj-)?[A-Za-z0-9_-]{20,}"

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
