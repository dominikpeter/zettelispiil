import { act, joinRoom, view } from "@/lib/room";
import { handle } from "../handle";

const clean = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);

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
    return a.type === "join" ? joinRoom(db, code, a.name) : act(db, code, pid, token, a);
  });
}
