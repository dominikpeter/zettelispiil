import { currentUser } from "@/lib/auth";
import { createRoom } from "@/lib/room";
import { count } from "@/lib/usage";
import { handle } from "./handle";

// POST { name, lang } → { code, pid, token } for the host; lang picks the funny team names.
// A host who is signed in unlocks AI for everyone in the room.
export async function POST(req: Request) {
  return handle(async (db) => {
    const body = await req.json();
    const room = await createRoom(db, body?.name, body?.lang, (await currentUser(req))?.id ?? "");
    await count({ rooms: 1 });
    return room;
  }, { req, kind: "create" });
}
