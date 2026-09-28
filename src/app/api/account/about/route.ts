import { cleanAbout, getAbout, setAbout } from "@/lib/about";
import { currentUser } from "@/lib/auth";

// GET → { about } | 401; POST { about } → { about } | 401: what the signed-in player wrote about themselves
export async function GET(req: Request) {
  const user = await currentUser(req);
  if (!user) return Response.json({ error: "not signed in" }, { status: 401 });
  return Response.json({ about: await getAbout(user.id) });
}

export async function POST(req: Request) {
  const user = await currentUser(req);
  if (!user) return Response.json({ error: "not signed in" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const about = cleanAbout(body?.about);
  try {
    await setAbout(user.id, about);
  } catch {
    return Response.json({ error: "not saved" }, { status: 503 });
  }
  return Response.json({ about });
}
