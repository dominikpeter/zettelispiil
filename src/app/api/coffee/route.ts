import { Ratelimit } from "@upstash/ratelimit";
import { backPath, cleanChf } from "@/lib/coffee";
import { DICT, type Lang } from "@/lib/i18n";
import { ipOf, redis } from "@/lib/store";
import { Stripe, stripe } from "@/lib/stripe";

// "buy me a coffee": a Stripe Checkout Session for a small donation. The amount is checked here, never trusted from the phone.
// The key only needs to create Checkout Sessions: a restricted key (rk_), set with `just stripe-setup`.
const perIp = redis && new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, "1 m"), prefix: "ratelimit:coffee" });
const FLOW = "coffee-qhzvmkrt"; // tags these sessions in the Stripe dashboard

// POST { chf, back, lang } → { url } of Stripe's payment page
export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as { chf?: unknown; back?: unknown; lang?: unknown } | null;
  const chf = cleanChf(b?.chf);
  if (!chf) return Response.json({ error: "amount" }, { status: 400 });
  if (!stripe) return Response.json({ error: "off" }, { status: 503 });
  // without Redis there is no limit: fine on a dev machine, closed when deployed (like the AI routes)
  if (perIp ? !(await perIp.limit(ipOf(req))).success : !!process.env.VERCEL) return Response.json({ error: "rate_limited" }, { status: 429 });
  const lang: Lang = b?.lang === "en" || b?.lang === "fr" ? b.lang : "de";
  const site = process.env.BETTER_AUTH_URL ?? new URL(req.url).origin; // the real domain on Vercel, never a header the client picks
  const back = backPath(b?.back);
  try {
    const s = await stripe.checkout.sessions.create({
      mode: "payment",
      submit_type: "donate",
      locale: lang,
      integration_identifier: FLOW,
      line_items: [{ quantity: 1, price_data: { currency: "chf", unit_amount: chf * 100, product_data: { name: DICT[lang].coffeeProduct } } }],
      success_url: `${site}${back}${back.includes("?") ? "&" : "?"}coffee=thanks`,
      cancel_url: `${site}${back}`,
    });
    return Response.json({ url: s.url });
  } catch (e) {
    console.error("stripe checkout", e instanceof Stripe.errors.StripeError ? e.type : "error"); // no request details in the log
    return Response.json({ error: "stripe" }, { status: 502 });
  }
}
