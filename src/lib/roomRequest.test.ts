import { test } from "node:test";
import assert from "node:assert/strict";
import { roomJson } from "../app/api/rooms/handle.ts";
import { RoomError } from "./room.ts";

test("room JSON accepts a bounded body without a content length", async () => {
  const req = new Request("http://localhost/api/rooms", { method: "POST", body: JSON.stringify({ name: "Zoë" }) });
  assert.equal(req.headers.get("content-length"), null);
  assert.deepEqual(await roomJson(req), { name: "Zoë" });
});

test("room JSON rejects oversized bodies even with a missing or false content length", async () => {
  for (const headers of [undefined, { "content-length": "10" }]) {
    const req = new Request("http://localhost/api/rooms", { method: "POST", headers, body: JSON.stringify({ name: "é".repeat(60_000) }) });
    await assert.rejects(roomJson(req), (e: RoomError) => e.status === 413);
  }
});
