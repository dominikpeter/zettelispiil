import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth";

// sign-in callbacks; 404 until sign-in is set up
const off = () => new Response(null, { status: 404 });
export const GET = (req: Request) => {
  const auth = getAuth();
  return auth ? toNextJsHandler(auth).GET(req) : off();
};
export const POST = (req: Request) => {
  const auth = getAuth();
  return auth ? toNextJsHandler(auth).POST(req) : off();
};
