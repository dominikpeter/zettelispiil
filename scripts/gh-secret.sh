# sourced by the CI setup scripts. put_gh NAME VALUE: sets a GitHub Actions repository secret. The value is never printed
# and never touches disk; it's piped straight into `gh secret set`. Needs `gh auth login` (already done for this repo).
put_gh() {
  printf '%s' "$2" | gh secret set "$1" --app actions >/dev/null
  echo "  $1 set on GitHub"
}
