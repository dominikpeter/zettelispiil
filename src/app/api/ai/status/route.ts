import { aiEnabled } from "@/lib/ai";
import { authEnabled, currentUser, PROVIDERS } from "@/lib/auth";

// GET → what this phone may do with AI: { ai, login: sign-in required?, providers, user }
export async function GET(req: Request) {
  const user = await currentUser(req);
  return Response.json(
    { ai: aiEnabled(), login: authEnabled(), providers: authEnabled() ? PROVIDERS : [], user: user && { name: user.name, email: user.email, image: user.image } },
    { headers: { "Cache-Control": "no-store" } },
  );
}
