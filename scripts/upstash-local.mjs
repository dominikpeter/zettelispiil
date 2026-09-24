// Local stand-in for Upstash's REST API, backed by a real Redis (dev/testing only).
// Speaks what @upstash/redis sends: POST / (one command), /pipeline, /multi-exec, Bearer auth,
// and base64 string results when the client asks for `Upstash-Encoding: base64`.
//
//   redis-server --port 6380 --daemonize yes
//   node scripts/upstash-local.mjs            # → http://localhost:8079, token "local"
//   UPSTASH_REDIS_REST_URL=http://localhost:8079 UPSTASH_REDIS_REST_TOKEN=local npm run build && npm start
import { createServer } from "node:http";
import Redis from "ioredis";

const PORT = Number(process.env.PORT ?? 8079);
const TOKEN = process.env.TOKEN ?? "local";
const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6380");

// ioredis turns HGETALL into an object; real Redis/Upstash reply with a flat [field, value, …] array
const raw = (v) => (v && typeof v === "object" && !Array.isArray(v) && !Buffer.isBuffer(v) ? Object.entries(v).flat() : v);
const b64 = (v) =>
  typeof v === "string" ? Buffer.from(v).toString("base64") : Array.isArray(v) ? v.map(b64) : v;

async function run(cmd, encode) {
  try {
    const [name, ...args] = cmd.map(String);
    const result = raw(await redis.call(name, ...args));
    return { result: encode ? b64(result) : result };
  } catch (e) {
    return { error: e.message };
  }
}

createServer(async (req, res) => {
  const send = (status, body) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (req.headers.authorization !== `Bearer ${TOKEN}`) return send(401, { error: "Unauthorized" });
  let text = "";
  for await (const chunk of req) text += chunk;
  const body = JSON.parse(text || "[]");
  const encode = req.headers["upstash-encoding"] === "base64";
  const path = new URL(req.url, "http://x").pathname;

  if (path === "/pipeline") return send(200, await Promise.all(body.map((c) => run(c, encode))));
  if (path === "/multi-exec") {
    // ponytail: MULTI via ioredis transaction; per-command errors surface as a whole-batch error
    const out = await redis.multi(body.map(([n, ...a]) => [String(n), ...a.map(String)])).exec();
    return send(200, out.map(([err, r]) => (err ? { error: err.message } : { result: encode ? b64(raw(r)) : raw(r) })));
  }
  return send(200, await run(body, encode));
}).listen(PORT, () => console.log(`upstash-local on http://localhost:${PORT} → ${redis.options.host}:${redis.options.port}`));
