import { test } from "node:test";
import assert from "node:assert/strict";
import { act, claimAi, cleanSettings, createRoom, joinRoom, pullStrokes, roomAi, pushStrokes, RoomError, sheetStrokes, view, type View } from "./room.ts";
import { computeStats } from "./stats.ts";
import { db as envStore, memoryStore, persistent } from "./store.ts";

// in-memory by default; set UPSTASH_REDIS_REST_URL/TOKEN to run the same tests against a real Redis
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
  return { db, host, all, as, see, tick, now: () => clock };
}

async function writeAll(as: Awaited<ReturnType<typeof setup>>["as"]) {
  await as(0, { type: "start" });
  for (const i of [0, 1, 2, 3]) await as(i, { type: "words", words: [`w${i}`] });
}

const describerView = async (see: (i: number) => Promise<View>) => {
  const v = await see(0);
  return { i: v.active!, v: await see(v.active!) };
};

test("room codes have 5 characters without lookalikes", async () => {
  const db = store();
  for (let i = 0; i < 20; i++) {
    const { code } = await createRoom(db, "Lisa");
    assert.match(code, /^[A-HJ-NP-Z2-9]{5}$/);
  }
});

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

test("describers take turns within their team; the host can pass on one who isn't there", async () => {
  const { as, see, tick } = await setup();
  await writeAll(as);
  const first = await describerView(see);
  const team = first.v.players[first.i].team;
  await assert.rejects(as((first.i + 1) % 4, { type: "pass" }), RoomError); // only the host passes
  await as(0, { type: "pass" });
  const second = await see(0);
  assert.equal(second.phase, "ready");
  assert.notEqual(second.players[second.active!].team, team); // the other team is up
  await as(second.active!, { type: "go" });
  tick(33_000); // time runs out
  const third = await see(0);
  assert.equal(third.players[third.active!].team, team); // back to the first team…
  assert.notEqual(third.active, first.i); // …with the passed describer's teammate
  await as(0, { type: "pass" });
  await as(0, { type: "pass" });
  assert.equal((await see(0)).active, first.i); // the team's turn order goes round
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

test("drawing round: the drawer's lines reach everyone sheet by sheet; only the drawer, only while drawing", async () => {
  const { as, see, db, host, all, tick, now } = await setup();
  await as(0, { type: "settings", settings: { rounds: ["draw"] } });
  await writeAll(as);
  const { i } = await describerView(see);
  const other = (i + 1) % 4;
  const push = (who: number, sheet: number | null, st: number[][]) => pushStrokes(db, host.code, all[who].pid, all[who].token, sheet, st, now());
  await as(i, { type: "go" });
  const sheet = (await see(other)).sheet!;
  assert.equal((await see(other)).word, null); // watchers get lines, never the word
  await assert.rejects(push(other, sheet, [[0, 1, 2, 3, 4]]), RoomError); // only the drawer draws
  await assert.rejects(push(i, sheet, [[0, 1, 2000]]), RoomError); // off the paper
  await push(i, sheet, [[0, 10, 10, 20, 20]]);
  await push(i, sheet, [[1, 20, 20, 30, 40], [2, 5, 5]]);
  assert.deepEqual((await pullStrokes(db, host.code, sheet, 0)).strokes, [[0, 10, 10, 20, 20], [1, 20, 20, 30, 40], [2, 5, 5]]);
  assert.deepEqual((await pullStrokes(db, host.code, sheet, 2)).strokes, [[2, 5, 5]]); // only what's new

  await as(i, { type: "wipe" });
  let r = await pullStrokes(db, host.code, sheet, 3);
  assert.notEqual(r.sheet, sheet); // watchers switch to the fresh sheet on their next pull
  assert.deepEqual(r.strokes, []);
  await assert.rejects(push(i, sheet, [[0, 1, 1]]), RoomError); // the old sheet is closed
  await push(i, r.sheet, [[0, 1, 1, 2, 2]]);
  await as(i, { type: "got", w: (await see(i)).word!.id });
  r = await pullStrokes(db, host.code, r.sheet, 1);
  assert.deepEqual(r.strokes, []); // next Zetteli, clean paper

  await as(i, { type: "pause" });
  await assert.rejects(push(i, r.sheet, [[0, 1, 1]]), RoomError); // no drawing while paused
  await as(i, { type: "resume" });
  await push(i, r.sheet, [[0, 1, 1]]);
  tick(40_000);
  await assert.rejects(push(i, r.sheet, [[0, 1, 1]]), RoomError); // time's up
});

test("teammates can count a guess, once; the other team can't; guessed words flash for everyone", async () => {
  const { as, see } = await setup();
  await writeAll(as);
  const { i, v } = await describerView(see);
  const mate = v.players.findIndex((p, j) => j !== i && p.team === v.players[i].team);
  const rival = v.players.findIndex((p) => p.team !== v.players[i].team);
  await as(i, { type: "go" });
  const w = (await see(i)).word!;
  await assert.rejects(as(rival, { type: "teamGot", seen: 0 }), RoomError);
  await as(mate, { type: "teamGot", seen: 0 });
  await as(i, { type: "got", w: w.id }); // the describer taps too late: already counted
  await as(mate, { type: "teamGot", seen: 0 }); // stale screen: ignored
  const after = await see(rival);
  assert.equal(after.turnGot, 1);
  assert.deepEqual(after.lastGot && { text: after.lastGot.text, by: after.lastGot.by }, { text: w.text, by: mate });
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

test("game language: starts as the host's language, only de/en/fr, old rooms default to de", async () => {
  const db = store();
  const { code, pid, token } = await createRoom(db, "Lisa", "fr");
  assert.equal((await view(db, code, pid, token)).settings.lang, "fr");
  await act(db, code, pid, token, { type: "settings", settings: { lang: "en" } });
  assert.equal((await view(db, code, pid, token)).settings.lang, "en");
  await act(db, code, pid, token, { type: "settings", settings: { lang: "xx" as never } });
  assert.equal((await view(db, code, pid, token)).settings.lang, "de");
  assert.equal(cleanSettings({}).lang, "de");
});

test("lists never grow past their cap, even when a push is refused", async () => {
  const db = memoryStore();
  assert.equal(await db.rpush("l", [1, 2, 3], 60, 4), 3);
  assert.equal(await db.rpush("l", [4, 5, 6], 60, 4), 6); // reports the overflow…
  assert.deepEqual((await db.lrangeWith("l", 0, "x")).items, [1, 2, 3, 4]); // …but keeps only 4
});

test("kick ignores a player that isn't an index", async () => {
  const db = store();
  const host = await createRoom(db, "Lisa");
  await joinRoom(db, host.code, "Nora");
  await assert.rejects(act(db, host.code, host.pid, host.token, { type: "kick", player: "length" as never }), RoomError);
  assert.equal((await view(db, host.code, host.pid, host.token)).players.length, 2);
});

test("a room opened by a signed-in host lends AI to its members, and only to them", async () => {
  const db = store();
  const ai = await createRoom(db, "Lisa", "de", "user-lisa");
  const guest = await joinRoom(db, ai.code, "Nora");
  assert.equal((await view(db, ai.code, guest.pid, guest.token)).ai, true);
  assert.equal(await roomAi(db, ai.code, guest.pid, guest.token), "user-lisa"); // members use the host's budget
  assert.equal(await roomAi(db, ai.code, guest.pid, "wrong"), ""); // a wrong token gets nothing
  assert.equal(await roomAi(db, ai.code, "nobody", guest.token), "");
  assert.equal(await roomAi(db, "../x", guest.pid, guest.token), ""); // junk codes never reach the store

  const plain = await createRoom(db, "Tim"); // host not signed in: no AI for the room
  assert.equal((await view(db, plain.code, plain.pid, plain.token)).ai, false);
  assert.equal(await roomAi(db, plain.code, plain.pid, plain.token), "");
});

test("a host who signs in after opening the room can turn AI on for it; nobody else can", async () => {
  const db = store();
  const host = await createRoom(db, "Lisa");
  const guest = await joinRoom(db, host.code, "Nora");
  await assert.rejects(claimAi(db, host.code, guest.pid, guest.token, "user-nora"), RoomError); // only the host
  await assert.rejects(claimAi(db, host.code, host.pid, host.token, ""), RoomError); // only when actually signed in
  await claimAi(db, host.code, host.pid, host.token, "user-lisa");
  assert.equal(await roomAi(db, host.code, guest.pid, guest.token), "user-lisa");
  await claimAi(db, host.code, host.pid, host.token, "user-other"); // the first account stays
  assert.equal(await roomAi(db, host.code, guest.pid, guest.token), "user-lisa");
});

test("three teams: players fill the smallest team, turns rotate through all three, scores per team", async () => {
  const db = store();
  const host = await createRoom(db, "P0");
  await act(db, host.code, host.pid, host.token, { type: "settings", settings: { teams: 3, perPlayer: 1 } });
  const others = [];
  for (let i = 1; i < 6; i++) others.push(await joinRoom(db, host.code, `P${i}`));
  const all = [host, ...others];
  const v = await view(db, host.code, host.pid, host.token);
  assert.equal(v.teamNames.length, 3);
  assert.deepEqual([0, 1, 2].map((t) => v.players.filter((p) => p.team === t).length), [2, 2, 2]);
  await act(db, host.code, host.pid, host.token, { type: "start" });
  for (const [i, p] of all.entries()) await act(db, host.code, p.pid, p.token, { type: "words", words: [{ word: `Wort${i}`, hint: "" }] });
  const teamsSeen: number[] = [];
  let clock = Date.now();
  for (let turn = 0; turn < 3; turn++) {
    const s = await view(db, host.code, host.pid, host.token, clock);
    teamsSeen.push(s.team);
    const d = all[s.players.findIndex((_, i) => i === s.active)];
    await act(db, host.code, d.pid, d.token, { type: "go" }, clock);
    clock += 31_000 + 2_000; // time runs out: next team
  }
  assert.equal(new Set(teamsSeen).size, 3); // every team had a turn
  assert.equal((await view(db, host.code, host.pid, host.token, clock)).scores[0].length, 3);
  // back to two teams: the third team's players move over
  await act(db, host.code, host.pid, host.token, { type: "cancel" }, clock);
  await act(db, host.code, host.pid, host.token, { type: "settings", settings: { teams: 2 } }, clock);
  const two = await view(db, host.code, host.pid, host.token, clock);
  assert.equal(two.teamNames.length, 2);
  assert.ok(two.players.every((p) => p.team < 2));
});

test("drawings are kept for the replay: guessed, skipped, time up; a wipe keeps the last sheet; blank ones are dropped", async () => {
  const { as, see, db, host, all, tick, now } = await setup();
  await as(0, { type: "settings", settings: { rounds: ["draw"], skips: 1 } });
  await writeAll(as);
  const { i } = await describerView(see);
  const push = async (st: number[][]) => pushStrokes(db, host.code, all[i].pid, all[i].token, (await see(i)).sheet, st, now());
  const word = async () => (await see(i)).word!.id;
  await as(i, { type: "go" });

  const skipped = await word();
  await push([[0, 1, 1, 9, 9]]);
  tick(3000);
  await as(i, { type: "skip", w: skipped });

  const got = await word();
  await push([[1, 5, 5, 6, 6]]);
  await as(i, { type: "wipe" });
  const last = (await see(i)).sheet!;
  await push([[2, 7, 7, 8, 8]]);
  tick(5000);
  await as(i, { type: "got", w: got });

  const blank = await word();
  tick(1000);
  await as(i, { type: "got", w: blank }); // nothing drawn: nothing to replay

  const late = await word();
  await push([[0, 3, 3]]);
  tick(40_000); // time's up

  // later turns draw nothing, so they leave nothing to replay
  for (let guard = 0; guard < 50 && (await see(0)).phase !== "end"; guard++) {
    const v = await see(0);
    if (v.phase === "ready") await as(v.active!, { type: "go" });
    else {
      tick(1000);
      const d = await see(v.active!);
      if (d.word) await as(v.active!, { type: "got", w: d.word.id });
    }
  }
  const end = await see(1);
  assert.equal(end.phase, "end");
  const ds = end.stats!.drawings;
  assert.deepEqual(ds.map(({ w, p, ms, got, r }) => ({ w, p, ms, got, r })), [
    { w: skipped, p: i, ms: 3000, got: false, r: 0 },
    { w: got, p: i, ms: 5000, got: true, r: 0 },
    { w: late, p: i, ms: 30_000 - 9000, got: false, r: 0 },
  ]);
  assert.equal(ds[1].sheet, last); // wiped: only the final sheet counts
  assert.deepEqual((await sheetStrokes(db, host.code, ds[1].sheet)).strokes, [[2, 7, 7, 8, 8]]);
  assert.deepEqual((await sheetStrokes(db, host.code, ds[0].sheet)).strokes, [[0, 1, 1, 9, 9]]); // an old sheet, exactly, not the drawer's latest
});

test("drawings: only in drawing rounds", async () => {
  const { as, see, tick } = await setup();
  await as(0, { type: "settings", settings: { rounds: ["describe"] } });
  await writeAll(as);
  for (let guard = 0; guard < 50 && (await see(0)).phase !== "end"; guard++) {
    const v = await see(0);
    if (v.phase === "ready") await as(v.active!, { type: "go" });
    else {
      tick(1000);
      await as(v.active!, { type: "got", w: (await see(v.active!)).word!.id });
    }
  }
  assert.deepEqual((await see(0)).stats!.drawings, []);
});

/** a running turn with heckling on; o = someone on the other team */
async function heckleTurn(heckles = 2) {
  const t = await setup();
  await t.as(0, { type: "settings", settings: { heckle: true, heckleMode: "fixed", heckles } });
  await writeAll(t.as);
  const { i } = await describerView(t.see);
  await t.as(i, { type: "go" });
  return { ...t, d: i, o: (i + 1) % 4 }; // teams alternate: the next player is on the other team
}

test("heckle: off by default and in the lobby settings, 1–5 presses", async () => {
  const { as, see } = await setup();
  const s = (await see(0)).settings;
  assert.deepEqual([s.heckle, s.heckles], [false, 2]);
  assert.deepEqual([cleanSettings({ heckles: 9 }).heckles, cleanSettings({ heckles: -3 }).heckles], [5, 1]);
  await writeAll(as);
  const { i } = await describerView(see);
  await as(i, { type: "go" });
  await assert.rejects(as((i + 1) % 4, { type: "heckle" }), RoomError); // setting off
  assert.equal((await see(i)).lastHeckle, null);
  assert.equal((await see((i + 1) % 4)).heckles, 0);
});

test("heckle: only the other team, a few presses each, one at a time, fresh every turn", async () => {
  const { as, see, tick, now, d, o } = await heckleTurn();
  assert.equal((await see(o)).heckles, 2);
  await as(o, { type: "heckle" });
  assert.deepEqual((await see(d)).lastHeckle, { n: 1, by: o, until: now() + 3000 }); // 30 s turn: 3 s
  assert.equal((await see(o)).heckles, 1);
  await assert.rejects(as(d, { type: "heckle" }), RoomError); // the describer can't
  await assert.rejects(as((d + 2) % 4, { type: "heckle" }), RoomError); // nor their team
  assert.equal((await see((d + 2) % 4)).heckles, 0);
  // no stacking: while it runs, a press does nothing and costs nothing
  tick(2000);
  await as((d + 3) % 4, { type: "heckle" });
  assert.equal((await see(d)).lastHeckle!.n, 1);
  assert.equal((await see((d + 3) % 4)).heckles, 2);
  tick(1000); // over
  await as(o, { type: "heckle" });
  assert.equal((await see(d)).lastHeckle!.n, 2);
  assert.equal((await see(o)).heckles, 0);
  tick(3000);
  await assert.rejects(as(o, { type: "heckle" }), RoomError); // used up
  // paused: nothing happens
  await as(0, { type: "pause" });
  await as((d + 3) % 4, { type: "heckle" });
  assert.equal((await see(d)).lastHeckle!.n, 2);
  await as(0, { type: "resume" });

  // next turn: the other team describes, the first describer's team heckles, counts start fresh
  tick(30_000);
  const n = await describerView(see);
  assert.notEqual(n.i % 2, d % 2);
  await as(n.i, { type: "go" });
  await as(d, { type: "heckle" });
  assert.deepEqual({ ...(await see(n.i)).lastHeckle, until: 0 }, { n: 3, by: d, until: 0 });
  await assert.rejects(as(o, { type: "heckle" }), RoomError); // now on the describing team
  tick(33_000);
  const n2 = await describerView(see);
  await as(n2.i, { type: "go" });
  assert.equal((await see((n2.i + 1) % 4)).heckles, 2); // same team as the first turn, fresh presses
});

test("heckle: at most a third of the turn is disturbed, the last one gets what's left", async () => {
  const { as, see, tick, now, d, o } = await heckleTurn(5);
  for (let k = 0; k < 3; k++) {
    await as(o, { type: "heckle" });
    tick(3000);
  }
  assert.equal((await see(o)).heckleDone, false);
  await as(o, { type: "heckle" });
  assert.equal((await see(d)).lastHeckle!.until, now() + 1000); // 10 s of a 30 s turn, 9 s used
  assert.equal((await see(o)).heckleDone, true);
  tick(1000);
  await as((d + 3) % 4, { type: "heckle" }); // enough for this turn
  assert.equal((await see(d)).lastHeckle!.n, 4);
  assert.equal((await see((d + 3) % 4)).heckles, 5); // nothing spent
});

test("heckle: a pause freezes a running heckle", async () => {
  const { as, see, tick, now, d, o } = await heckleTurn();
  await as(o, { type: "heckle" });
  const until = now() + 3000;
  tick(1000);
  await as(0, { type: "pause" });
  tick(5000);
  await as(0, { type: "resume" });
  assert.equal((await see(d)).lastHeckle!.until, until + 5000);
});

test("changing the team count evens the teams out with as few moves as possible", async () => {
  const db = store();
  const host = await createRoom(db, "P0");
  for (let i = 1; i < 6; i++) await joinRoom(db, host.code, `P${i}`); // 3 : 3 on two teams
  const sizes = async () => {
    const v = await view(db, host.code, host.pid, host.token);
    return v.teamNames.map((_, t) => v.players.filter((p) => p.team === t).length);
  };
  const before = (await view(db, host.code, host.pid, host.token)).players.map((p) => p.team);
  await act(db, host.code, host.pid, host.token, { type: "settings", settings: { teams: 3 } });
  assert.deepEqual(await sizes(), [2, 2, 2]); // the new team gets players right away
  const after = (await view(db, host.code, host.pid, host.token)).players.map((p) => p.team);
  assert.equal(after.filter((t, i) => t !== before[i]).length, 2); // only two had to move
  await act(db, host.code, host.pid, host.token, { type: "settings", settings: { teams: 4 } });
  assert.deepEqual((await sizes()).sort(), [1, 1, 2, 2]);
  await act(db, host.code, host.pid, host.token, { type: "settings", settings: { teams: 2 } });
  assert.deepEqual(await sizes(), [3, 3]);
});

test("auto heckling in a room: with nobody behind there is no bonus, so nobody can heckle", async () => {
  const { as, see } = await setup();
  await as(0, { type: "settings", settings: { heckle: true } }); // auto is the default
  assert.equal((await see(0)).settings.heckleMode, "auto");
  await writeAll(as);
  const { i } = await describerView(see);
  await as(i, { type: "go" }); // first turn: 0:0, nobody is behind
  const foe = (i + 1) % 4;
  assert.equal((await see(foe)).heckles, 0);
  await assert.rejects(as(foe, { type: "heckle" }), RoomError);
});

test("auto heckling in a room: a team behind shares its bonus, and it shows in the end stats", async () => {
  const dice = process.env.E2E_HECKLE_DICE;
  process.env.E2E_HECKLE_DICE = "always"; // the dice always grant a bonus to a team that is behind
  try {
    const { as, see, tick } = await setup();
    await as(0, { type: "settings", settings: { heckle: true } });
    await writeAll(as);
    const first = await describerView(see);
    const lead = first.v.players[first.i].team;
    await as(first.i, { type: "go" });
    await as(first.i, { type: "got", w: (await see(first.i)).word!.id }); // 1 : 0
    tick(33_000);

    const second = await describerView(see); // the team behind describes: the leader gets no bonus
    await as(second.i, { type: "go" });
    assert.deepEqual([(await see(first.i)).heckles, (await see(first.i)).heckleGranted], [0, 0]);
    tick(33_000);

    const third = await describerView(see); // the leader describes: the team behind (1 point) gets 1 press
    assert.equal(third.v.players[third.i].team, lead);
    await as(third.i, { type: "go" });
    const [a, b] = [0, 1, 2, 3].filter((p) => third.v.players[p].team !== lead);
    assert.deepEqual([(await see(a)).heckles, (await see(a)).heckleGranted, (await see(b)).heckles], [1, 1, 1]);
    assert.equal((await see(third.i)).heckles, 0);
    await as(b, { type: "heckle" });
    assert.deepEqual({ ...(await see(third.i)).lastHeckle, until: 0 }, { n: 1, by: b, until: 0 });
    tick(4000);
    assert.deepEqual([(await see(a)).heckles, (await see(a)).heckleGranted], [0, 1]); // the team's bonus is used up, for both
    await assert.rejects(as(a, { type: "heckle" }), RoomError);

    for (let guard = 0; guard < 50 && (await see(0)).phase !== "end"; guard++) {
      const v = await see(0);
      if (v.phase === "roundEnd") await as(0, { type: "nextRound" });
      else if (v.phase === "ready") await as(v.active!, { type: "go" });
      else {
        tick(1000);
        const d = await see(v.active!);
        if (d.word) await as(v.active!, { type: "got", w: d.word.id });
      }
    }
    const end = (await see(0)).stats!;
    assert.deepEqual(end.heckles, [{ by: b, bonus: true }]);
    assert.ok(end.bonusGot[1 - lead] >= 1); // this turn's bonus, and any later turn the leader described
    assert.equal(end.bonusGot[lead] ?? 0, 0); // the leader never gets one
  } finally {
    if (dice === undefined) delete process.env.E2E_HECKLE_DICE;
    else process.env.E2E_HECKLE_DICE = dice;
  }
});
