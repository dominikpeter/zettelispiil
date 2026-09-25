#!/usr/bin/env bash
# After a commit: if it touched player-facing code but not docs/MANUAL.md, ask Claude to update the manual.
jq -r .tool_input.command | grep -qE "(^|[;&|[:space:]])git( -C [^ ]+)? commit" || exit 0
git log -1 --since="2 minutes ago" --format=%H | grep -q . || exit 0 # the commit failed (e.g. a pre-commit hook): nothing new to check
files=$(git diff-tree --no-commit-id --name-only -r HEAD 2>/dev/null)
echo "$files" | grep -q '^docs/MANUAL.md$' && exit 0
echo "$files" | grep -qE '^src/(components|app|lib/(i18n|room|stats|prefs)\.tsx?)' || exit 0
jq -n --arg f "$(echo "$files" | tr '\n' ' ')" '{hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: ("The last commit changed player-facing code (" + $f + ") but not docs/MANUAL.md. If players would notice the change, update docs/MANUAL.md (German, Swiss spelling) and commit it.")}}'
