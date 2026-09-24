import { test } from "node:test";
import assert from "node:assert/strict";
import { act, createRoom, joinRoom, RoomError, view, type View } from "./room.ts";
import { computeStats } from "./stats.ts";
import { db as envStore, memoryStore, persistent } from "./store.ts";

// in-memory by default; set UPSTASH_REDIS_REST_URL/TOKEN (e.g. scripts/upstash-local.mjs) to run against Redis
const store = () => (persistent ? envStore : memoryStore());

// 4 players, alternating teams on join (A, B, A, B), 1 word each, 30 s turns, 2 rounds
async function setup() {
  const db = store();
  const host = await createRoom(db, "Lisa");
  const others = [];
  for (const n of ["Nora", "Tim", "Beni"]) others.push(await joinRoom(db, host.code, n));
  const all = [host, ...others];
  let clock = 1_000_000;
  const as = (i: number, a: Parameters<typeof act>[4]) => act(db, host.code, all[i].pid, all[i].token, a, clock);
  const see = (i: number) => view(db, host.code, all[i].pid, all[i].token, clock);
  const tick = (ms: number) => (clock += ms);
  await as(0, { type: "settings", settings: { perPlayer: 1, seconds: 30, rounds: ["describe", "sound"] } });
  return { db, host, as, see, tick };
}

async function writeAll(as: Awaited<ReturnType<typeof setup>>["as"]) {
  await as(0, { type: "start" });
  for (const i of [0, 1, 2, 3]) await as(i, { type: "words", words: [`w${i}`] });
}

const describerView = async (see: (i: number) => Promise<View>) => {
  const v = await see(0);
  return { i: v.active!, v: await see(v.active!) };
};

test("teams fill alternately and start needs two per team", async () => {
  const db = store();
  const host = await createRoom(db, "Lisa");
  const nora = await joinRoom(db, host.code, "Nora");
  await joinRoom(db, host.code, "Tim");
  const v = await view(db, host.code, host.pid, host.token);
  assert.deepEqual(v.players.map((p) => p.team), [0, 1, 0]);
  await assert.rejects(act(db, host.code, host.pid, host.token, { type: "start" }), (e: RoomError) => e.code === "teams");
  await assert.rejects(act(db, host.code, nora.pid, nora.token, { type: "start" }), RoomError); // only the host starts
});

test("only the describer sees the Zetteli; guessing empties the bowl and ends the round", async () => {
  const { as, see, tick } = await setup();
  await writeAll(as);
  assert.equal((await see(0)).phase, "ready");
  const { i } = await describerView(see);
  await assert.rejects(as((i + 1) % 4, { type: "go" }), RoomError); // not your turn
  await as(i, { type: "go" });
  const views = await Promise.all([0, 1, 2, 3].map(see));
  assert.equal(views.filter((v) => v.word).length, 1);
  assert.ok(views[i].word);
  assert.equal(views[i].bowlLeft, 4);

  for (let n = 0; n < 4; n++) {
    tick(2000);
    const w = (await see(i)).word!.id;
    await as(i, { type: "got", w });
    await as(i, { type: "got", w }); // double tap counts once
  }
  const v = await see(0);
  assert.equal(v.phase, "roundEnd");
  assert.equal(v.scores[0][v.players[i].team], 4);
  assert.ok(v.carryMs >= 20_000); // 22 s left carry into the next round

  await as(0, { type: "nextRound" });
  const r2 = await see(0);
  assert.equal(r2.phase, "ready");
  assert.equal(r2.active, i); // same describer continues with the time left
  assert.equal(r2.bowlLeft, 4);
});

test("time up puts the Zetteli back and hands over to the other team", async () => {
  const { as, see, tick } = await setup();
  await writeAll(as);
  const { i, v } = await describerView(see);
  await as(i, { type: "go" });
  tick(3000);
  await as(i, { type: "got", w: (await see(i)).word!.id });
  const w = (await see(i)).word!.id;
  await as(i, { type: "skip", w });
  assert.notEqual((await see(i)).word!.id, w); // skip draws a different one
  tick(28_000); // 1 s past 0:00, inside grace: a late got still counts
  await as(i, { type: "got", w: (await see(i)).word!.id });
  tick(2000); // past grace
  const after = await see(0);
  assert.equal(after.phase, "ready");
  assert.notEqual(after.players[after.active!].team, v.players[i].team);
  assert.equal(after.bowlLeft, 2);
  assert.deepEqual(after.lastTurn && { p: after.lastTurn.p, got: after.lastTurn.got }, { p: i, got: 2 });
});

test("full game ends with stats for everyone", async () => {
  const { as, see, tick } = await setup();
  await writeAll(as);
  for (let guard = 0; guard < 50 && (await see(0)).phase !== "end"; guard++) {
    const v = await see(0);
    if (v.phase === "roundEnd") await as(0, { type: "nextRound" });
    else if (v.phase === "ready") await as(v.active!, { type: "go" });
    else {
      tick(4000);
      const d = await see(v.active!);
      if (!d.word) continue; // time ran out meanwhile
      await as(v.active!, { type: "got", w: d.word!.id });
    }
  }
  const end = await see(2);
  assert.equal(end.phase, "end");
  assert.ok(end.stats);
  const s = computeStats(end.stats.log, end.stats.turns, end.stats.words, end.players.map((p) => p.team), end.scores);
  assert.equal(s.totals[0] + s.totals[1], 8); // 4 Zetteli × 2 rounds
  assert.equal(s.race.at(-1)![0] + s.race.at(-1)![1], 8);
  assert.equal(s.fastest!.ms, 4000);
  assert.equal(s.players.reduce((n, p) => n + p.got, 0), 8);
  await as(0, { type: "lobby" });
  assert.equal((await see(0)).phase, "lobby");
});

test("wrong token is rejected and sees nothing", async () => {
  const { db, host } = await setup();
  await assert.rejects(act(db, host.code, host.pid, "nope", { type: "start" }), RoomError);
  assert.equal((await view(db, host.code, host.pid, "nope")).me, -1);
});

test("skip limit: one set aside, swap back and forth, no second skip", async () => {
  const { as, see, tick } = await setup(); // default: 1 skip per turn
  await writeAll(as);
  const { i } = await describerView(see);
  await as(i, { type: "go" });
  const a = (await see(i)).word!.id;
  await as(i, { type: "skip", w: a });
  let v = await see(i);
  const b = v.word!.id;
  assert.notEqual(b, a);
  assert.deepEqual(v.held.map((h) => h.id), [a]);
  assert.equal(v.canSkip, false);
  await assert.rejects(as(i, { type: "skip", w: b }), RoomError); // second skip refused
  await as(i, { type: "back", w: b, to: a }); // swap back
  v = await see(i);
  assert.equal(v.word!.id, a);
  assert.deepEqual(v.held.map((h) => h.id), [b]);
  await as(i, { type: "back", w: a, to: b }); // and forth
  assert.equal((await see(i)).word!.id, b);
  await as(i, { type: "got", w: b });
  v = await see(i);
  assert.notEqual(v.word!.id, a); // a new one from the bowl, a stays aside
  assert.deepEqual(v.held.map((h) => h.id), [a]);
  // bowl down to the set-aside one: it comes back into hand
  await as(i, { type: "got", w: v.word!.id });
  await as(i, { type: "got", w: (await see(i)).word!.id });
  v = await see(i);
  assert.equal(v.word!.id, a);
  assert.deepEqual(v.held, []);
  tick(40_000);
  assert.deepEqual((await see(i)).held, []); // time up clears it
});

test("no skipping once time is up; skips 0 means never", async () => {
  const { as, see, tick } = await setup();
  await as(0, { type: "settings", settings: { skips: 0 } });
  await writeAll(as);
  const { i } = await describerView(see);
  await as(i, { type: "go" });
  const w = (await see(i)).word!.id;
  assert.equal((await see(i)).canSkip, false);
  await assert.rejects(as(i, { type: "skip", w }), RoomError);
  tick(30_500); // past 0:00, inside grace
  await as(i, { type: "skip", w }); // ignored, not an error
  assert.equal((await see(i)).word!.id, w);
});

test("funny team names in the host's language; players and teams can rename in the lobby", async () => {
  const db = store();
  const host = await createRoom(db, "Lisa", "fr");
  const nora = await joinRoom(db, host.code, "Nora"); // team B
  const v = await view(db, host.code, host.pid, host.token);
  assert.equal(v.teamNames.length, 2);
  assert.notEqual(v.teamNames[0], v.teamNames[1]);
  await act(db, host.code, nora.pid, nora.token, { type: "rename", name: "  Nora B.  " });
  await act(db, host.code, nora.pid, nora.token, { type: "teamName", team: 1, name: "Die Zettelkönige" });
  await assert.rejects(act(db, host.code, nora.pid, nora.token, { type: "teamName", team: 0, name: "Nope" }), RoomError); // not her team
  await act(db, host.code, host.pid, host.token, { type: "teamName", team: 0, name: "Lilas" }); // host may rename any
  const w = await view(db, host.code, host.pid, host.token);
  assert.deepEqual(w.teamNames, ["Lilas", "Die Zettelkönige"]);
  assert.equal(w.players[1].name, "Nora B.");
});

test("pause stops the clock and hides the Zetteli; cancel goes back to the lobby", async () => {
  const { as, see, tick } = await setup();
  await writeAll(as);
  const { i } = await describerView(see);
  await as(i, { type: "go" });
  tick(10_000);
  await as(i, { type: "pause" });
  let v = await see(i);
  assert.equal(v.pausedLeft, 20_000);
  assert.equal(v.word, null); // no peeking while paused
  const w = (await as(i, { type: "got", w: 0 }), await see(i));
  assert.equal(w.turnGot, 0); // taps during pause do nothing
  tick(60_000); // a long pause never times out
  assert.equal((await see(0)).phase, "turn");
  await as(0, { type: "resume" }); // the host may resume too
  v = await see(i);
  assert.equal(v.pausedLeft, 0);
  assert.equal(v.endsAt - (v.now), 20_000); // 20 s left, as before the pause
  assert.ok(v.word);
  await assert.rejects(as((i + 1) % 4 === 0 ? 1 : (i + 1) % 4, { type: "cancel" }), RoomError); // only the host cancels
  await as(0, { type: "cancel" });
  v = await see(2);
  assert.equal(v.phase, "lobby");
  assert.equal(v.players.length, 4);
});

test("drawing round: strokes reach every phone, wipe and a new Zetteli start a fresh sheet", async () => {
  const { as, see } = await setup();
  await as(0, { type: "settings", settings: { rounds: ["draw"] } });
  await writeAll(as);
  const { i } = await describerView(see);
  const other = (i + 1) % 4;
  await as(i, { type: "go" });
  await assert.rejects(as(other, { type: "draw", strokes: [[0, 1, 2, 3, 4]] }), RoomError); // only the drawer draws
  await assert.rejects(as(i, { type: "draw", strokes: [[0, 1, 2000]] }), RoomError); // off the paper
  await as(i, { type: "draw", strokes: [[0, 10, 10, 20, 20]] });
  await as(i, { type: "draw", strokes: [[1, 20, 20, 30, 40], [2, 5, 5]] });
  const v = await see(other);
  assert.deepEqual(v.drawing, [[0, 10, 10, 20, 20], [1, 20, 20, 30, 40], [2, 5, 5]]);
  assert.equal(v.word, null); // watchers see lines, never the word
  await as(i, { type: "wipe" });
  assert.deepEqual((await see(other)).drawing, []);
  await as(i, { type: "draw", strokes: [[0, 1, 1, 2, 2]] });
  await as(i, { type: "got", w: (await see(i)).word!.id });
  assert.deepEqual((await see(other)).drawing, []); // next Zetteli, clean paper
});

test("same word twice: both copies cancelled, both writers write a new one; hints reach the describer", async () => {
  const { as, see } = await setup();
  await as(0, { type: "start" });
  await as(0, { type: "words", words: [{ word: "Velo", hint: "zwei Räder" }] });
  assert.equal((await see(0)).iDone, true);
  await as(1, { type: "words", words: ["  vélo! "] }); // same word, spelled differently
  let a = await see(0);
  let b = await see(1);
  assert.equal(a.iDone, false);
  assert.deepEqual(a.myWrite?.cancelled, ["Velo"]);
  assert.equal(b.iDone, false);
  assert.deepEqual(b.myWrite?.cancelled, ["vélo!"]);
  assert.equal(a.done, 0);
  await assert.rejects(as(2, { type: "words", words: [""] }), RoomError);
  await as(0, { type: "words", words: [{ word: "Aare", hint: "Fluss in Bern" }] });
  await as(1, { type: "words", words: ["Zytglogge"] });
  await as(2, { type: "words", words: ["Rösti"] });
  await as(3, { type: "words", words: ["Fondue"] });
  a = await see(0);
  assert.equal(a.phase, "ready");
  await as(a.active!, { type: "go" });
  b = await see(a.active!);
  assert.ok(b.word);
  if (b.word!.text === "Aare") assert.equal(b.word!.hint, "Fluss in Bern");
});
