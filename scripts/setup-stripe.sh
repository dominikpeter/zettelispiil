#!/usr/bin/env bash
# Sets up "buy me a coffee" (Stripe Checkout). Asks for the keys silently, writes them to .env.local and to Vercel production.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/env.sh
# `just stripe-setup local`: this computer only (.env.local), e.g. with sandbox keys to try it out; without: also Vercel production
[ "${1:-}" = local ] && export LOCAL_ONLY=1

cat <<'HOW'
In the Stripe dashboard (try it in a sandbox first, then repeat with live keys):
 1. Developers → API keys → Create restricted key. Permission: "Checkout Sessions: Write", everything else None.
 2. Developers → Webhooks → Add endpoint
      URL:    https://zettelispiil.ch/api/coffee/webhook
      Events: checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.async_payment_failed
    then reveal its signing secret (whsec_…).
HOW

read -rsp "Restricted key (rk_…): " key; echo
case "$key" in
  rk_*) ;;
  sk_*) echo "  note: that's a full secret key. A restricted key (rk_) can do far less if it ever leaks." ;;
  *) echo "That doesn't look like a Stripe key, nothing changed."; exit 1 ;;
esac
read -rsp "Webhook signing secret (whsec_…${LOCAL_ONLY:+, empty to skip}): " hook; echo
case "$hook" in
  whsec_*) ;;
  "") [ "${LOCAL_ONLY:-}" = 1 ] || { echo "The live site needs the webhook secret, nothing changed."; exit 1; } ;;
  *) echo "That doesn't look like a webhook secret, nothing changed."; exit 1 ;;
esac
put STRIPE_SECRET_KEY "$key"
[ -n "$hook" ] && put STRIPE_WEBHOOK_SECRET "$hook"
if [ "${LOCAL_ONLY:-}" = 1 ]; then
  echo "Done. Try it locally with: just dev (webhooks locally: stripe listen --forward-to localhost:3001/api/coffee/webhook)"
else
  echo "Done. Redeploy with: just deploy (the coffee button appears once the key is set at build time)"
fi
