#!/usr/bin/env bash
# Before a shell command: stop the git moves AGENTS.md rules out, and ask before pushing dev while a release is merging.
cmd=$(jq -r '.tool_input.command // ""')
grep -qE "(^|[;&|[:space:]])git " <<<"$cmd" || exit 0

decide() { jq -n --arg d "$1" --arg r "$2" '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: $d, permissionDecisionReason: $r}}'; exit 0; }

grep -qE "git (commit|push|merge|rebase)[^;&|]*--no-verify" <<<"$cmd" &&
  decide deny "Hooks are not bypassed here (AGENTS.md): fix what the hook reports instead of --no-verify."
grep -qE "git push[^;&|]*([[:space:]]|:)main([[:space:]]|$)" <<<"$cmd" &&
  decide deny "main only changes through a pull request (just pr / just release); work on dev."
grep -qE "git push[^;&|]*(--force|[[:space:]]-f([[:space:]]|$))" <<<"$cmd" && ! grep -q -- "--force-with-lease" <<<"$cmd" &&
  decide deny "No force-push to the shared branches: other agents work on dev too. Make a new commit."

# a release pull request about to merge: a push to dev lands in it after the checks passed, and Copilot's late review
# comments then need another patch release (lesson from 1.16.x)
if grep -qE "git push" <<<"$cmd" && [ "$(git branch --show-current 2>/dev/null)" = dev ]; then
  open=$(gh pr list --base main --head dev --state open --json title -q '.[] | select(.title | startswith("Release v")) | .title' 2>/dev/null | head -1)
  [ -n "$open" ] && decide ask "\"$open\" is open: a push to dev now goes into that release. Push anyway?"
fi
exit 0
