#!/usr/bin/env bash
# A real payment, end to end, in Stripe's test mode (no money): card and TWINT on Stripe's own test pages, back to the app,
# and Stripe's webhook through to our /api/coffee/webhook. Needs `stripe login` with test mode. Apple Pay and Google Pay
# need a real wallet on a real phone; `just stripe-check` shows they're on.
set -euo pipefail
cd "$(dirname "$0")/.."
port=3355
app="http://localhost:$port"
log=$(mktemp)
cleanup() { kill "${listen:-}" "${server:-}" 2>/dev/null || true; rm -f "$log"; }
trap cleanup EXIT

hook=$(stripe listen --print-secret)
stripe listen --forward-to "$app/api/coffee/webhook" --events checkout.session.completed,checkout.session.async_payment_succeeded > "$log" 2>&1 &
listen=$!
npm run build >/dev/null
OPENAI_API_KEY= OPENROUTER_API_KEY= RESEND_API_KEY= STRIPE_SECRET_KEY= STRIPE_WEBHOOK_SECRET="$hook" npx next start -p "$port" >/dev/null 2>&1 &
server=$!
until curl -sf "$app" >/dev/null; do sleep 1; done

# the session our /api/coffee creates, made by the CLI in test mode
session() {
  stripe checkout sessions create -d mode=payment -d submit_type=donate -d locale=en \
    -d "line_items[0][quantity]=1" -d "line_items[0][price_data][currency]=chf" -d "line_items[0][price_data][unit_amount]=$1" \
    -d "line_items[0][price_data][product_data][name]=A coffee for Zettelispiil" \
    -d "success_url=$app/?coffee=thanks" -d "cancel_url=$app/" | jq -r .url
}
STRIPE_CARD_URL=$(session 500) STRIPE_TWINT_URL=$(session 100) BASE_URL="$app" npx playwright test e2e/stripe-sandbox.spec.ts --workers=1 "$@"

sleep 3 # Stripe sends the webhooks right after paying
# stripe listen logs the event and its response on separate lines ("--> type [evt_x]" then "<-- [200] ... [evt_x]"),
# so count delivered responses directly; --events above already scopes the log to the two events we're testing
ok=$(grep -c '<-- *\[200\]' "$log" || true)
echo "webhooks answered 200: $ok (want 2)"
[ "$ok" -ge 2 ]
