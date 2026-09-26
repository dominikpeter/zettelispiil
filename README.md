# Zettelispiil

The Swiss party game with paper slips, as a mobile web app. Everyone writes words on *Zetteli*, they go into a bowl, and two teams race to guess them over up to five rounds that keep getting harder.

**Play:** [zettelispiil.ch](https://zettelispiil.ch) (also [zettelispiil.vercel.app](https://zettelispiil.vercel.app))

## How it's played

1. Every player writes a few words (people, places, things, films…) on Zetteli. Nobody sees the others'.
2. Two teams take turns. The describer draws Zetteli from the bowl and gets their team to guess as many as possible before the timer runs out. Swipe right for guessed, left to set one aside.
3. When the bowl is empty the round ends and all Zetteli go back in. Time left over carries into the next round.
4. Same words, stricter rules each round:

| Round | Rule |
| --- | --- |
| Umschreiben | Explain with as many words as you like, just not the word itself |
| Pantomime | No words, no sounds |
| Ein Wort | Exactly one word as a clue |
| Geräusch | Only noises |
| Zeichnen | Draw it: on your phone with everyone watching live (several phones, on by default), or on a flip chart or paper (one phone, opt-in) |

The host can reorder rounds by dragging (long-press on touch), drop or add rounds, and set Zetteli per person, seconds per turn and how many Zetteli may be skipped per turn. With a limit of 1 you can set one aside and swap back and forth, but not skip a second.

In games on several phones, teammates can tap "Erraten" on their own phones too (a word only ever counts once), and each guessed word flashes briefly on every other phone. Long words shrink to stay on one line.

The host can pause a turn (the clock stops on every phone and the Zetteli is hidden) and cancel the game back to the lobby.

At the end: the winner, a score race over every turn, points per round, speed per round, a player ranking, and the fastest, slowest and most-skipped Zetteli. Tap a player or a Zetteli for details round by round.

## Two ways to play

- **Ein Handy:** one phone goes round. Players are listed on the start screen (Lisa, Nora, Nelly, Tim by default), the phone asks to be handed to each writer and describer. Runs entirely in the browser, and survives a reload.
- **Mehrere Handys:** the host opens a room, everyone joins with the 6-letter code, the QR code or the link. The Zetteli only ever show on the describer's phone. Rooms live in Redis for a day.

## AI help

With `OPENAI_API_KEY` set (Vercel AI SDK, model `OPENAI_MODEL`, default `gpt-6-luna`), or else `OPENROUTER_API_KEY` (via OpenRouter, model `OPENROUTER_MODEL`, default `openai/gpt-oss-120b`; with both keys set, a call Luna still fails after a retry runs once more there), writing a Zetteli gets checked in the background: spelling suggestions, a warning for words that are hard to guess, and a short hint the writer can change. The describer sees the hint under the word. The ✨ buttons invent funny player and team names. Each phone can switch AI help and hints off in the settings. AI calls are rate limited (300/min per network, 5000/day overall).

Stuck for words? Type a topic and the AI suggests three to pick from.

Or let the AI write them all ("KI schreibt", a lobby option for the host when AI is on): nobody knows a single word beforehand. The host picks topics from a fixed list (animals, Switzerland, films, …); at start the host's phone calls `POST /api/ai/zetteli` for players × Zetteli each (max 120) words with hints, and the room skips the write phase. Words come from a Redis pool per language and topic that the model refills in batches; every word served is remembered for 30 days per language (sorted set) and not served again while there are others. Only topic ids and AI-written words ever reach the prompt. If the AI fails, the host can switch the room back to writing. The stats list these Zetteli as "by AI".

AI answers are reused through Redis: a word checked once (by anyone) is answered from the cache for 30 days, the model writes names six at a time into a pool (per typed name) and topic ideas nine at a time, so most taps need no model call at all. The rest run on `gpt-6-luna` without reasoning, with short answers and in OpenAI's priority lane (~2 s). Cached are only words and topics, never who wrote them.

AI help needs an account (Google or GitHub). Signed out, no AI features show at all. A room opened by a signed-in host (or whose host signs in later) has AI for everyone in it, on the host's budget: 120 calls per minute and 300 per day per room, 1000 per day per host.

The host sets the language of the Zetteli (German, English or French) in the lobby; the AI checks, hints and suggests in that language while every phone keeps its own app language.

Writing the same word as someone else cancels both copies, with or without AI; both writers write a new one.

German by default, plus English and French. Light and dark mode and eight color themes (Post-it by default, Nacht, Tinte, Gold, Abendrot, Ozean, Arosa, Aarau) in the settings sheet. Player and team names are editable; teams start with a funny random name.

## Install and apps

- **Web app (PWA):** "Add to Home Screen" on iPhone or Android starts Zettelispiil full screen with its own icon (`src/app/manifest.ts`, icons from `src/lib/appIcon.tsx`). A running game keeps the screen on (Screen Wake Lock).
- **Phone apps (Capacitor 8):** `android/` and `ios/` are native shells that load zettelispiil.ch, so every web release reaches them without a store update; `native-shell/offline.html` shows when there's no connection. Inside the apps, `src/lib/native.ts` uses real haptics, the system share sheet and keep-awake.
  - Android: `just android` builds a test APK (JDK 21 + Android SDK: `brew install openjdk@21 android-commandlinetools`), `just android-run` installs it on a USB phone.
  - iOS: install Xcode, then `just ios` opens the project; sign with your Apple developer account.
  - Store release needs a Google Play ($25 once) and an Apple developer account ($99/year). Sign-in with Google inside the app needs the system browser (Google blocks embedded browsers); until that is wired up, sign in on the web.

## Security

- Rooms: every action needs the player's random token; host-only and describer-only actions are checked on the server.
- Writes are rate limited per network (Upstash, keyed by Vercel's own client IP header), bodies are capped, drawing sheets and turn logs have hard limits.
- AI needs sign-in (Google, GitHub, Microsoft via Better Auth, encrypted cookie sessions, 7 days), is rate limited per account and overall, and its answers are length-bounded.
- Headers: Content-Security-Policy (same origin only), `X-Frame-Options: DENY`, `nosniff`, strict referrer, camera only for the QR scanner.
- Commits run a secret scan, lint, type check and unit tests (prek).
- `/admin` shows usage (rooms, games, joins, sign-ins, AI calls and tokens per feature, accounts) to the verified accounts in `ADMIN_EMAIL` only; everyone else gets a 404. Counters live in Redis per day.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Upstash Redis · Lucide icons · Playwright

```
src/lib/room.ts        game rules: rooms, teams, turns, timer, pause, skips, drawing, scoring (storage-agnostic)
src/lib/ai.ts          spelling/difficulty/hint check and funny names (server only)
src/lib/stats.ts       end-of-game numbers derived from the turn log
src/lib/store.ts       Redis store (Upstash) with an in-memory fallback
src/lib/localStore.ts  the same store interface on localStorage, for one-phone games
src/components/Game.tsx  every game screen, shared by both modes
src/app/r/[code]       every-phone room, polls /api/rooms/[code]
src/app/local          one-phone game
```

Server functions run in Frankfurt (`fra1`, set as the project's function region in Vercel), next to the Redis database: there is no Swiss region on Vercel or Upstash, and Frankfurt is about 10 ms from Zurich.

Drawing has its own channel: the drawer's phone appends strokes to a per-Zetteli Redis list every 120 ms (checked against a small `drawer` record instead of loading the room), and watching phones fetch only the strokes after the last one they have, polling faster while lines arrive and tracing them in smoothly.

The server keeps the clock: a turn ends at `endsAt`, and a guess tapped at 0:00 still counts for 1.5 s while it travels. Every phone corrects its countdown by the server time it receives.

## Develop

```bash
just setup           # npm install + git hooks (prek: secret scan, lint, types, unit tests)
just dev             # in-memory rooms, no Redis needed
just check           # lint, typecheck, unit tests
just e2e             # Playwright: Pixel 7 plus WebKit iPhone SE / 15 / 15 Pro Max layouts, against a production build
```

`just` lists every recipe. The player manual is in [docs/MANUAL.md](docs/MANUAL.md).

## Deploy

Deployed on Vercel. AI help needs `OPENROUTER_API_KEY` or `OPENAI_API_KEY`. Rooms need `KV_REST_API_URL` and `KV_REST_API_TOKEN` (set by the Upstash for Redis integration) or `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`. Without them the API answers `503 no_storage` on Vercel, and one-phone games still work.

Sign-in (needed for AI help) uses Google, GitHub or Microsoft: `just auth-setup` asks for the OAuth keys and stores them locally and in Vercel.

```bash
just release 1.3.0 "notes"   # checks, e2e, tag, GitHub release, deploy
```
