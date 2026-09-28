#!/usr/bin/env bash
# After a commit: if it touched player-facing code, ask Claude whether docs/MANUAL.md and the tour (/anleitung, the
# `guide` texts in i18n.ts) still tell the truth. Each is skipped when the commit already changed it.
jq -r .tool_input.command | grep -qE "(^|[;&|[:space:]])git( -C [^ ]+)? commit" || exit 0
git log -1 --since="2 minutes ago" --format=%H | grep -q . || exit 0 # the commit failed (e.g. a pre-commit hook): nothing new to check
files=$(git diff-tree --no-commit-id --name-only -r HEAD 2>/dev/null)
echo "$files" | grep -qE '^src/(components|app|lib/(i18n|room|stats|prefs|settings)\.tsx?)' || exit 0
list=$(echo "$files" | tr '\n' ' ')
msg=""
echo "$files" | grep -q '^docs/MANUAL.md$' ||
  msg+="The last commit changed player-facing code ($list) but not docs/MANUAL.md. If players would notice the change, update docs/MANUAL.md (German, Swiss spelling) and commit it. "
echo "$files" | grep -qE '^src/app/anleitung/' || git show HEAD -- src/lib/i18n.ts | grep -qE '^[-+].*guide|^[-+] +\{ h: ' ||
  msg+="Also check the tour (/anleitung: src/app/anleitung/page.tsx and \`guide\` in src/lib/i18n.ts): does any chapter now describe the game wrongly, or leave out something players should know? Fix it in all three languages if so."
[ -z "$msg" ] && exit 0
jq -n --arg m "$msg" '{hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: $m}}'
