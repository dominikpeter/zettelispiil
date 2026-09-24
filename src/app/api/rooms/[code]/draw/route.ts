import { pullStrokes, pushStrokes } from "@/lib/room";
import { handle } from "../../handle";

const clean = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6); // 5 letters today, 4 for rooms made before

// GET ?sheet=N&from=M → { sheet, from, strokes }: only the lines a watching phone doesn't have yet
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const code = clean((await params).code);
  const q = new URL(req.url).searchParams;
  return handle((db) => pullStrokes(db, code, Number(q.get("sheet")) || 0, Number(q.get("from")) || 0));
}

// POST { pid, token, sheet, strokes } from the drawer's phone
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const code = clean((await params).code);
  return handle(async (db) => {
    const b = await req.json();
    await pushStrokes(db, code, b?.pid, b?.token, b?.sheet, b?.strokes);
  });
}
