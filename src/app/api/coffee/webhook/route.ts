import Stripe from "stripe";
import { redis } from "@/lib/store";
import { count } from "@/lib/usage";

// Stripe tells us a coffee was paid: counted for the admin page. Only events signed with our webhook secret count.
// Nothing else happens on payment (a donation unlocks nothing), so the success page never has to.
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "sk_unused"); // verifying a signature needs no API key
const PAID = new Set(["checkout.session.completed", "checkout.session.async_payment_succeeded"]);

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return new Response("off", { status: 503 });
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(await req.text(), req.headers.get("stripe-signature") ?? "", secret);
  } catch {
    return new Response("bad signature", { status: 400 });
  }
  if (PAID.has(event.type)) {
    const s = event.data.object as Stripe.Checkout.Session;
    // paid only (a bank transfer completes the session unpaid and pays later); once per session, however often Stripe retries
    if (s.payment_status !== "unpaid" && (!redis || (await redis.set(`stripe:paid:${s.id}`, 1, { nx: true, ex: 60 * 60 * 24 * 30 })))) {
      await count({ coffees: 1, coffee_rappen: s.amount_total ?? 0 });
    }
  }
  return new Response("ok");
}
