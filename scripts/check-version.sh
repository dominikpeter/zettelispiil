#!/usr/bin/env bash
# The version in the settings sheet comes from package.json (next.config.ts). Make sure it matches what is released:
#  - on a release tag, the tag must be v<package.json version>
#  - with gh signed in, package.json must not be behind the latest GitHub release
# Quiet unless something is off; no tag, no gh or no network is not an error.
set -euo pipefail

version=$(node -p 'require("./package.json").version')

if tag=$(git describe --tags --exact-match 2>/dev/null); then
  if [ "$tag" != "v$version" ]; then
    echo "version mismatch: commit is tagged $tag but package.json says $version (settings would show $version)" >&2
    exit 1
  fi
fi

if command -v gh >/dev/null && gh auth status >/dev/null 2>&1; then
  latest=$(gh release view --json tagName -q .tagName 2>/dev/null || true)
  if [ -n "$latest" ]; then
    newest=$(printf '%s\n%s\n' "${latest#v}" "$version" | sort -V | tail -1)
    if [ "$newest" != "$version" ]; then
      echo "package.json is at $version but GitHub's latest release is $latest: the settings would show an old version" >&2
      exit 1
    fi
  fi
fi
