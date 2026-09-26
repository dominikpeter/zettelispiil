<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Working on Zettelispiil

## Commands: use `just`

Run `just` to list recipes. Prefer them over raw commands so everyone runs the same thing.

| Recipe | Does |
| --- | --- |
| `just setup` | `npm install` + `prek install` (git hooks) |
| `just dev` | dev server, in-memory rooms |
| `just check` | lint + typecheck + unit tests (what the pre-commit hook runs) |
| `just e2e [args]` | Playwright against a local production build on :3217: game and auth tests two at a time, then the multi-phone layout tests one at a time (in parallel they overload a laptop) |
| `just e2e-prod [args]` | Playwright against https://zettelispiil.ch |
| `just pr` | push the current branch and open its pull request into `main` (or show the open one) |
| `just release X.Y.Z "notes"` | on `dev`: check, secret scan, bump the version onto the PR; merging it ships (CI tags, writes the GitHub release, deploys to Vercel, builds iOS) |
| `just deploy` | `vercel deploy --prod` by hand (normally CI does it) |
| `just secret NAME [local]` | store any key: asks for it hidden, writes `.env.local` and Vercel (or `.env.local` only). The user runs it; agents may start it for them but never see the value |
| `just auth-setup` | OAuth keys for sign-in; the user runs it, it prompts for secrets |
| `just email-setup` | Resend key for sign-in with a code by email; the user runs it, it prompts for the key |
| `just stripe-setup` | Stripe restricted key + webhook secret for "buy me a coffee"; the user runs it, it prompts for both |
| `just stripe-check` | which payment methods the coffee checkout offers (card, Apple Pay, Google Pay, TWINT) and TWINT's approval; read-only, needs `stripe login` |
| `just android` / `just android-run` | Android test build (APK) / install it on a USB phone. Needs JDK 21 + Android SDK |
| `just ios` | sync the iOS project and open it in Xcode |
| `just app-icons` | regenerate app icons and splash screens from `assets/` |

## Branches and releases

- Work on `dev`, never commit to `main`: it only changes through a pull request (`just pr`). CI runs lint, typecheck, unit and e2e tests on every PR.
- Merging a PR into `main` is what ships: if `package.json` carries a new version (`just release` bumps it), CI tags it, writes the GitHub release from the PR description, deploys to Vercel and starts the iOS build. A merge without a version bump only runs the checks.

## Script standards

- New tasks go in the `justfile` as a thin recipe with a one-line `#` comment (it shows in `just --list`). Logic longer than a few lines goes in `scripts/*.sh` (`set -euo pipefail`, run from repo root) and the recipe calls it.
- Scripts that need secrets prompt with `read -rs` and never echo them. Agents never type, paste, or commit secrets; the user runs such scripts.
- Git hooks are managed by prek (`.pre-commit-config.yaml`): secret scan, eslint, tsc, unit tests. Don't bypass with `--no-verify`.

## Conventions

- UI strings live in `src/lib/i18n.ts` in DE (default, Swiss spelling: "ss", never "ß"), EN and FR. Add all three.
- Icons from lucide-react, no emojis. Colours only through theme tokens (`@shadcn/lint` rejects raw colours and unknown classes).
- Mobile first: check the WebKit iPhone layout tests (`e2e/layout.spec.ts`) when changing play screens.
- Player-facing changes: update `docs/MANUAL.md` in the same commit (a Claude hook reminds you after each commit).
