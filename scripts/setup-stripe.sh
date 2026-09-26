#!/usr/bin/env bash
# Sets up "buy me a coffee" (Stripe Checkout). Asks for the keys silently, writes them to .env.local and to Vercel production.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/env.sh

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
read -rsp "Webhook signing secret (whsec_…): " hook; echo
case "$hook" in whsec_*) ;; *) echo "That doesn't look like a webhook secret, nothing changed."; exit 1 ;; esac
put STRIPE_SECRET_KEY "$key"
put STRIPE_WEBHOOK_SECRET "$hook"
echo "Done. Redeploy with: just deploy (the coffee button appears once the key is set at build time)"
