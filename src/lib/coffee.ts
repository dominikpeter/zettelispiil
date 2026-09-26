// "buy me a coffee": the sizes, and the rules the server checks every amount against (shared by the settings sheet and the API)
export const COFFEES = [
  { id: "small", chf: 1 },
  { id: "big", chf: 5 },
  { id: "deluxe", chf: 10 },
] as const;
export const MAX_CHF = 500; // a typo like 5000 shouldn't go through

/** a whole number of francs from 1 to MAX_CHF, or null */
export function cleanChf(x: unknown): number | null {
  const n = typeof x === "string" && /^\d+$/.test(x.trim()) ? Number(x) : x;
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= MAX_CHF ? n : null;
}

/** where Stripe sends the player back: a path on this site only (no "//evil.com", no full URLs), or the home page */
export function backPath(x: unknown): string {
  if (typeof x !== "string" || !x.startsWith("/") || x.startsWith("//") || x.includes("\\") || x.length > 200) return "/";
  const u = new URL(x, "https://x.invalid");
  u.searchParams.delete("coffee");
  return u.pathname + u.search;
}
