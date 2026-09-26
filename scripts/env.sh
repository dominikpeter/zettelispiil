# sourced by the setup scripts. put NAME VALUE: replace in .env.local, and set in Vercel production (not with LOCAL_ONLY=1). The value is never printed.
put() {
  touch .env.local
  grep -v "^$1=" .env.local > .env.local.tmp || true
  printf "%s='%s'\n" "$1" "$2" >> .env.local.tmp # single quotes: Next doesn't expand $ in them
  mv .env.local.tmp .env.local
  if [ "${LOCAL_ONLY:-}" = 1 ]; then echo "  $1 set (.env.local only)"; return; fi
  vercel env rm "$1" production --yes >/dev/null 2>&1 || true
  printf '%s' "$2" | vercel env add "$1" production --sensitive >/dev/null # sensitive: nobody can read it back from Vercel
  echo "  $1 set"
}
