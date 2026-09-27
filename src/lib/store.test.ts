import { test } from "node:test";
import assert from "node:assert/strict";
import type { Redis } from "@upstash/redis";
import { redisStore } from "./store.ts";

test("a failed lease release preserves the mutation result or original failure", async (t) => {
  t.mock.method(console, "error", () => {});
  const redis = {
    set: async () => "OK",
    eval: async () => { throw new Error("release unavailable"); },
  } as unknown as Redis;
  const db = redisStore(redis);
  assert.equal(await db.withLock("room:test", async () => "saved"), "saved");
  const original = new Error("mutation failed");
  await assert.rejects(db.withLock("room:test", async () => { throw original; }), (e) => e === original);
});

test("Redis fences every scoped mutation and cannot release a successor's lease", async (t) => {
  const { execFileSync, spawn } = await import("node:child_process");
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { StoreBusyError } = await import("./store.ts");
  try {
    execFileSync("redis-server", ["--version"], { stdio: "ignore" });
    execFileSync("redis-cli", ["--version"], { stdio: "ignore" });
  } catch {
    if (process.env.CI) throw new Error("Redis is required for the CI store regression");
    return t.skip("install Redis to run the distributed store regression locally");
  }
  const directory = mkdtempSync(join(tmpdir(), "zetteli-redis-"));
  const socket = join(directory, "redis.sock");
  const server = spawn("redis-server", ["--port", "0", "--unixsocket", socket, "--save", "", "--appendonly", "no"], { stdio: "ignore" });
  const stopped = new Promise<void>((resolve) => server.once("exit", () => resolve()));
  t.after(async () => {
    server.kill("SIGTERM");
    await stopped;
    rmSync(directory, { recursive: true, force: true });
  });
  const command = (...args: (string | number)[]): unknown => {
    const raw = execFileSync("redis-cli", ["-s", socket, "--json", ...args.map(String)], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    if (raw.startsWith("error:")) throw new Error(raw);
    return JSON.parse(raw);
  };
  for (let n = 0; ; n++) {
    try { assert.equal(command("PING"), "PONG"); break; }
    catch (error) {
      if (n === 100) throw error;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  const redis = {
    set: async (key: string, value: string, options: { ex: number }) => command("SET", key, value, "EX", options.ex, "NX"),
    eval: async (script: string, keys: string[], args: string[]) => command("EVAL", script, keys.length, ...keys, ...args),
  } as unknown as Redis;
  const db = redisStore(redis);
  await db.withLock("probe", async (scoped) => {
    command("EXPIRE", "lock:probe", 1);
    assert.equal(await scoped.set("value", { n: 1 }, { ex: 60 }), true);
    assert.ok(Number(command("TTL", "lock:probe")) >= 29); // a successful mutation renews ownership
    assert.equal(await scoped.set("value", "duplicate", { ex: 60, nx: true }), false);
    assert.equal(command("GET", "value"), '{"n":1}');
    await scoped.hset("hash", "field", { n: 2 }, 60);
    assert.equal(command("HGET", "hash", "field"), '{"n":2}');
    assert.equal(await scoped.rpush("list", [[1], [2], [3]], 60, 2), 3);
    assert.deepEqual(command("LRANGE", "list", 0, -1), ["[1]", "[2]"]);
    assert.equal(await scoped.expire("value", 90), true);
    await scoped.hdel("hash", "field");
    assert.equal(command("HEXISTS", "hash", "field"), 0);
    command("SET", "lock:probe", "successor", "EX", 60);
    for (const write of [
      () => scoped.set("value", "stale", { ex: 1 }),
      () => scoped.hset("hash", "field", "stale", 1),
      () => scoped.hdel("hash", "field"),
      () => scoped.rpush("list", ["stale"], 1, 1),
      () => scoped.expire("value", 1),
    ]) await assert.rejects(write, StoreBusyError);
  });
  assert.equal(command("GET", "lock:probe"), "successor");
  assert.equal(command("GET", "value"), '{"n":1}');
  assert.deepEqual(command("LRANGE", "list", 0, -1), ["[1]", "[2]"]);
});
