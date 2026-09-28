#!/usr/bin/env bash
# commit-msg hook: the first line is `type(scope): summary`, like the rest of the history (the release notes and the
# changelog read them). Merge, revert and fixup/squash/amend commits keep git's own wording (rebase --autosquash).
set -euo pipefail
first=$(head -1 "$1")
types="feat|fix|docs|perf|refactor|test|ci|build|chore|style|revert|release"
if ! grep -qE "^(($types)(\([a-z0-9/-]+\))?!?: .+|Merge |Revert |fixup! |squash! |amend! )" <<<"$first"; then
  echo "commit message: the first line is type(scope): summary, e.g. \"fix(tour): the back link clears the clock\""
  echo "types: ${types//|/ }"
  exit 1
fi
