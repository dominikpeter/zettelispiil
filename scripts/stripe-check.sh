#!/usr/bin/env bash
# Shows whether the coffee payment methods are on and usable, straight from Stripe (needs `stripe login`, read-only).
set -euo pipefail
# the account's own default configuration (others belong to connected apps)
cfg=$(stripe payment_method_configurations list --live 2>/dev/null | jq '.data[] | select(.is_default and .application == null)')
for m in card apple_pay google_pay twint klarna amazon_pay; do
  jq -r --arg m "$m" '"\($m): \(.[$m].display_preference.value // "n/a"), usable now: \(.[$m].available // false)"' <<<"$cfg"
done
echo "TWINT approval: $(stripe accounts retrieve --live 2>/dev/null | jq -r '.capabilities.twint_payments // "none"')"
echo "Webhooks: $(stripe webhook_endpoints list --live 2>/dev/null | jq -r '[.data[] | "\(.url) (\(.status))"] | join(", ")')"
