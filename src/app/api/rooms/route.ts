import { currentUser } from "@/lib/auth";
import { createRoom } from "@/lib/room";
import { handle } from "./handle";

// POST { name, lang } → { code, pid, token } for the host; lang picks the funny team names.
// A host who is signed in unlocks AI for everyone in the room.
export async function POST(req: Request) {
  return handle(async (db) => {
    const body = await req.json();
    return createRoom(db, body?.name, body?.lang, (await currentUser(req))?.id ?? "");
  }, { req, kind: "create" });
}
