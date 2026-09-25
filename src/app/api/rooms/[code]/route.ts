import { after } from "next/server";
import { currentUser } from "@/lib/auth";
import { act, claimAi, joinRoom, view } from "@/lib/room";
import { count } from "@/lib/usage";
import { handle } from "../handle";

const clean = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6); // 5 letters today, 4 for rooms made before

// GET (x-pid / x-token headers, kept out of URLs and logs) → this player's view, polled by every phone
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const code = clean((await params).code);
  return handle((db) => view(db, code, req.headers.get("x-pid"), req.headers.get("x-token")));
}

// POST { type: "join", name } or { pid, token, type, ...action }
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const code = clean((await params).code);
  return handle(async (db) => {
    const { pid, token, ...a } = await req.json();
    if (a.type === "join") {
      const me = await joinRoom(db, code, a.name);
      after(() => count({ joins: 1 })); // usage counters wait until the player has their answer
      return me;
    }
    if (a.type === "claimAi") return claimAi(db, code, pid, token, (await currentUser(req))?.id ?? ""); // the host signed in: AI for the whole room
    const done = await act(db, code, pid, token, a);
    if (a.type === "start") after(() => count({ games: 1 })); // only reached when the host's start went through
    return done;
  }, { req, kind: "act" });
}
