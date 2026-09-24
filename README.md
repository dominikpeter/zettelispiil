# Zettelispiil

The Swiss party game with paper slips, as a mobile web app. Everyone writes words on *Zetteli*, they go into a bowl, and two teams race to guess them over four rounds that keep getting harder.

**Play:** [zettelispiil.vercel.app](https://zettelispiil.vercel.app)

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

The host can reorder or drop rounds and set Zetteli per person, seconds per turn and how many Zetteli may be skipped per turn. With a limit of 1 you can set one aside and swap back and forth, but not skip a second.

At the end: the winner, a score race over every turn, points per round, speed per round, a player ranking, and the fastest, slowest and most-skipped Zetteli.

## Two ways to play

- **Ein Handy:** one phone goes round. Players are listed on the start screen (Lisa, Beni, Tim, Nora, Domi by default), the phone asks to be handed to each writer and describer. Runs entirely in the browser, and survives a reload.
- **Jedes Handy:** the host opens a room, everyone joins with the 4-letter code, the QR code or the link. The Zetteli only ever show on the describer's phone. Rooms live in Redis for a day.

German by default, plus English and French. Light and dark mode and three color themes (Nacht, Tinte, Gold) in the settings sheet. Player and team names are editable; teams start with a funny random name.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Upstash Redis · Lucide icons · Playwright

```
src/lib/room.ts        game rules: rooms, teams, turns, timer, skips, scoring (pure, storage-agnostic)
src/lib/stats.ts       end-of-game numbers derived from the turn log
src/lib/store.ts       Redis store (Upstash) with an in-memory fallback
src/lib/localStore.ts  the same store interface on localStorage, for one-phone games
src/components/Game.tsx  every game screen, shared by both modes
src/app/r/[code]       every-phone room, polls /api/rooms/[code]
src/app/local          one-phone game
```

The server keeps the clock: a turn ends at `endsAt`, and a guess tapped at 0:00 still counts for 1.5 s while it travels. Every phone corrects its countdown by the server time it receives.

## Develop

```bash
npm install
npm run dev          # in-memory rooms, no Redis needed
npm test             # game logic and stats (node:test)
npm run e2e          # Playwright on a phone viewport, against a production build
npm run lint
```

To run rooms against a real Redis locally:

```bash
redis-server --port 6380 --daemonize yes
npm run redis:local  # Upstash-compatible REST API on :8079, token "local"
UPSTASH_REDIS_REST_URL=http://localhost:8079 UPSTASH_REDIS_REST_TOKEN=local npm run dev
```

## Deploy

Deployed on Vercel. Rooms need `KV_REST_API_URL` and `KV_REST_API_TOKEN` (set by the Upstash for Redis integration) or `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`. Without them the API answers `503 no_storage` on Vercel, and one-phone games still work.

```bash
vercel deploy --prod
```
