import { redis } from "@/lib/store";
import { Stripe, verifier } from "@/lib/stripe";
import { count } from "@/lib/usage";

// Stripe tells us a coffee was paid: counted for the admin page. Only events signed with our webhook secret count.
// Nothing else happens on payment (a donation unlocks nothing), so the success page never has to.
const PAID = new Set(["checkout.session.completed", "checkout.session.async_payment_succeeded"]);

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return new Response("off", { status: 503 });
  let event: Stripe.Event;
  try {
    event = await verifier.webhooks.constructEventAsync(await req.text(), req.headers.get("stripe-signature") ?? "", secret);
  } catch {
    return new Response("bad signature", { status: 400 });
  }
  const s = event.data.object as Stripe.Checkout.Session;
  // paid only (TWINT and bank payments can complete the session unpaid and pay later); once per session, however often Stripe retries
  if (PAID.has(event.type) && s.payment_status !== "unpaid") {
    const mark = `stripe:paid:${s.id}`;
    if (redis && !(await redis.set(mark, 1, { nx: true, ex: 60 * 60 * 24 * 30 }))) return new Response("ok"); // counted already
    if (!(await count({ coffees: 1, coffee_rappen: s.amount_total ?? 0 }))) {
      await redis?.del(mark).catch(() => {}); // not counted: let Stripe's retry try again
      return new Response("retry", { status: 500 });
    }
  }
  return new Response("ok");
}
