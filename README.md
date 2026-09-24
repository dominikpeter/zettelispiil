# Zettelispiil

The Swiss party game with paper slips, as a mobile web app. Everyone writes words on *Zetteli*, they go into a bowl, and two teams race to guess them over four rounds that keep getting harder.

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
| Zeichnen | Draw it: on your phone with everyone watching live (every phone), or on a flip chart or paper (one phone). Opt-in |

The host can reorder or drop rounds and set Zetteli per person, seconds per turn and how many Zetteli may be skipped per turn. With a limit of 1 you can set one aside and swap back and forth, but not skip a second.

In every-phone games, teammates can tap "Erraten" on their own phones too (a word only ever counts once), and each guessed word flashes briefly on every other phone. Long words shrink to stay on one line.

The host can pause a turn (the clock stops on every phone and the Zetteli is hidden) and cancel the game back to the lobby.

At the end: the winner, a score race over every turn, points per round, speed per round, a player ranking, and the fastest, slowest and most-skipped Zetteli.

## Two ways to play

- **Ein Handy:** one phone goes round. Players are listed on the start screen (Lisa, Beni, Tim, Nora, Domi by default), the phone asks to be handed to each writer and describer. Runs entirely in the browser, and survives a reload.
- **Jedes Handy:** the host opens a room, everyone joins with the 4-letter code, the QR code or the link. The Zetteli only ever show on the describer's phone. Rooms live in Redis for a day.

## AI help

With `OPENAI_API_KEY` set (Vercel AI SDK, model `OPENAI_MODEL`, default `gpt-6-luna`), writing a Zetteli gets checked in the background: spelling suggestions, a warning for words that are hard to guess, and a short hint the writer can change. The describer sees the hint under the word. The ✨ buttons invent funny player and team names. Each phone can switch AI help and hints off in the settings. AI calls are rate limited (300/min per network, 5000/day overall).

Stuck for words? Type a topic and the AI suggests three to pick from.

Writing the same word as someone else cancels both copies, with or without AI; both writers write a new one.

German by default, plus English and French. Light and dark mode and five color themes (Nacht, Tinte, Gold, Abendrot, Ozean) in the settings sheet. Player and team names are editable; teams start with a funny random name.

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
npm install
npm run dev          # in-memory rooms, no Redis needed
npm test             # game logic and stats (node:test)
npm run e2e          # Playwright: Pixel 7 plus WebKit iPhone SE / 15 / 15 Pro Max layouts, against a production build
npm run lint
```

To run rooms against a real Redis locally:

```bash
redis-server --port 6380 --daemonize yes
npm run redis:local  # Upstash-compatible REST API on :8079, token "local"
UPSTASH_REDIS_REST_URL=http://localhost:8079 UPSTASH_REDIS_REST_TOKEN=local npm run dev
```

## Deploy

Deployed on Vercel. AI help needs `OPENAI_API_KEY`. Rooms need `KV_REST_API_URL` and `KV_REST_API_TOKEN` (set by the Upstash for Redis integration) or `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`. Without them the API answers `503 no_storage` on Vercel, and one-phone games still work.

```bash
vercel deploy --prod
```
