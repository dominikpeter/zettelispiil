import { ImageResponse } from "next/og";
import { AppIcon } from "@/lib/appIcon";

// PNG icons for the web app manifest: 192 and 512 px, plus a "maskable" one with room around the Zetteli
// (Android crops maskable icons into circles or squircles). Built once, cached like a static file.
const KINDS = { "192": { size: 192, pad: 0 }, "512": { size: 512, pad: 0 }, maskable: { size: 512, pad: 0.2 } } as const;

export const dynamic = "force-static";
export const generateStaticParams = () => Object.keys(KINDS).map((kind) => ({ kind }));

export async function GET(_: Request, { params }: { params: Promise<{ kind: string }> }) {
  const k = KINDS[(await params).kind as keyof typeof KINDS];
  if (!k) return new Response("not found", { status: 404 });
  return new ImageResponse(<AppIcon size={k.size} pad={k.pad} />, { width: k.size, height: k.size });
}
