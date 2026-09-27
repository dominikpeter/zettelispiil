"use client";

import Link from "next/link";
import { useT } from "@/lib/prefs";
import { Bowl, btn2 } from "@/lib/ui";

// an address that leads nowhere (and /admin without an admin list): the game's own look, in the player's language,
// instead of Next's plain English page
export default function NotFound() {
  const t = useT();
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-12 text-center">
      <Bowl pile={false} className="w-32" />
      <h1 className="text-3xl font-extrabold tracking-tight text-balance">{t.notFound}</h1>
      <Link href="/" className={`${btn2} w-auto px-6`}>
        {t.home}
      </Link>
    </main>
  );
}
