// server only: the one Stripe client. null until `just stripe-setup` has set the key (an empty value counts as unset).
import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY || "";
export const stripe = key ? new Stripe(key) : null;
/** checks webhook signatures; that needs the webhook secret, not the API key */
export const verifier = stripe ?? new Stripe("sk_unused");
export { Stripe };
