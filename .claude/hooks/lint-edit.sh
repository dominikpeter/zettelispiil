#!/usr/bin/env bash
# After an edit: lint just that file and hand any errors straight back, so they are fixed now instead of at the commit.
f=$(jq -r '.tool_input.file_path // ""')
cd "$CLAUDE_PROJECT_DIR" || exit 0
case "$f" in
  *.ts | *.tsx | *.mjs) ;;
  *.md) [[ "$f" == */docs/MANUAL.md ]] || exit 0 ;;
  *) exit 0 ;;
esac
[ -f "$f" ] || exit 0
out=""
if [[ "$f" == *.md || "$f" == */src/lib/i18n.ts ]]; then
  hits=$(grep -n "ß" "$f" | head -5)
  [ -n "$hits" ] && out+="Swiss spelling: ss, never ß:"$'\n'"$hits"$'\n'
fi
if [[ "$f" != *.md ]]; then
  lint=$(npx eslint --quiet --format json "$f" 2>/dev/null | jq -r '.[].messages[] | "\(.line):\(.column) \(.message | split("\n")[0]) (\(.ruleId // "parse"))"' 2>/dev/null | head -20)
  [ -n "$lint" ] && out+="eslint errors:"$'\n'"$lint"$'\n'
fi
[ -z "$out" ] && exit 0
jq -n --arg c "$out" '{hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: ("In the file just edited: " + $c)}}'
