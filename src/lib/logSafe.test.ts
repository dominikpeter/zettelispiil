import assert from "node:assert/strict";
import test from "node:test";
import { logSafe } from "./logSafe.ts";

test("server logs keep an error's name and message, never the request or response it carries", () => {
  const e = Object.assign(new Error("Bad Request"), { name: "AI_APICallError", requestBodyValues: { prompt: "The player wrote about themselves: spielt Alphorn" }, responseBody: "Matterhorn" });
  assert.equal(logSafe(e), "AI_APICallError: Bad Request");
  assert.ok(!logSafe(e).includes("Alphorn"));
  assert.equal(logSafe({ prompt: "secret" }), "object");
  assert.equal(logSafe("the whole prompt"), "string");
});
