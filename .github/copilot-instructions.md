# Zettelispiil: instructions for GitHub Copilot (code review and coding agent)

Zettelispiil is a Next.js 16 / React 19 salad-bowl party game, live at https://zettelispiil.ch. `AGENTS.md` is the source
of truth for how to work in this repo; read it first. The essentials:

## Reviewing a pull request

Report only real problems, each with a concrete failure scenario; no style nits, no praise. In this order:

1. **Correctness:** logic errors, wrong conditions, missing `await`, broken edge cases, race conditions.
2. **Security:** auth and the admin check (`src/lib/auth.ts`, `src/app/admin`), rate limits (`src/app/api/ai/guard.ts`,
   `src/app/api/rooms/handle.ts`), the Stripe checkout and webhook (`src/app/api/coffee`), redirects, secrets, input
   validation at API boundaries, room access (`src/lib/room.ts`: every action checks the player's id and token), AI
   output treated as untrusted (`src/lib/ai.ts`).
3. **This repo's rules:**
   - Every UI string lives in `src/lib/i18n.ts`, in German (default), English and French.
   - German text uses Swiss spelling: "ss", never "ß".
   - No raw colors and no arbitrary Tailwind values where a token exists: use the tokens in `src/app/globals.css`.
     No emojis: lucide icons.
   - Mobile first; no screen may scroll sideways at 320px (`e2e/layout.spec.ts`).
   - Any change players can see updates `docs/MANUAL.md`.
4. **Tests:** new behavior has a test (unit: `src/lib/*.test.ts`, e2e: `e2e/*.spec.ts`).

## Writing code (coding agent)

- Use the `justfile` for everything: `just check` (lint, typecheck, unit tests), `just e2e <spec>`.
- Branch from and open pull requests against `dev`, never `main`.
- Keep changes small and match the surrounding code: comment density, naming, idiom.
