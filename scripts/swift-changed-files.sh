#!/bin/bash
#
# Which Swift files a change touched — one answer, for CI and for a developer.
#
#   swift-changed-files.sh --working-directory apps/ios
#   swift-changed-files.sh --working-directory apps/ios --base origin/main --worktree
#
# Emits repository-relative paths, NUL-delimited, for `xcrun swift-format`.
#
# This file exists because the answer used to live only inside `ios-ci.yml`'s
# lint step, where nothing else could call it. A consumer wanting the same check
# locally had to reimplement it, and the first one that tried drifted inside a
# single commit — a bare `**/*.swift` pathspec, which omits a Swift file sitting
# directly under the working directory, and no `-z`, which drops a filename
# outside ASCII through `core.quotePath`. Both make a local "clean" that CI
# contradicts, and both were only findable by comparing two lists by hand
# (darwin-health/evo#281).
#
# Two modes, differing only in which commits they compare:
#
#   commit  what CI asks: HEAD and its first parent, falling back to every
#           tracked file when there is no first parent — a fresh branch, a
#           squashed history, the first commit in a repository
#   base    what a developer asks: the merge base with a named ref, so the
#           question is "what has this branch changed", optionally including
#           work that is not committed yet
#
# Base-ref policy belongs to the caller. CI has no merge base to speak of: the
# checkout retains the commit and its first parent and nothing else.

set -Eeuo pipefail

WORKING_DIRECTORY=""
BASE=""
INCLUDE_WORKTREE="false"

usage() {
    cat >&2 <<'USAGE'
Usage: swift-changed-files.sh --working-directory <path> [--base <ref>] [--worktree]

  --working-directory  repository-relative directory holding the Swift sources
  --base               compare against the merge base with this ref, rather
                       than against HEAD's first parent
  --worktree           also include uncommitted and untracked Swift files
USAGE
    exit 2
}

while [[ "$#" -gt 0 ]]; do
    case "$1" in
        --working-directory) WORKING_DIRECTORY="${2:-}"; shift 2 ;;
        --base) BASE="${2:-}"; shift 2 ;;
        --worktree) INCLUDE_WORKTREE="true"; shift ;;
        -h|--help) usage ;;
        *) echo "swift-changed-files.sh: unknown argument $1" >&2; usage ;;
    esac
done

[[ -n "$WORKING_DIRECTORY" ]] || usage

# Trailing slashes would produce `apps/ios//**/*.swift`, which matches nothing.
WORKING_DIRECTORY="${WORKING_DIRECTORY%/}"

# `:(glob)` is the whole point of naming this in one place. Without it `**/` is
# an ordinary two-star sequence with no zero-directory meaning, so
# `apps/ios/Top.swift` does not match and is silently skipped.
PATHSPEC=":(glob)${WORKING_DIRECTORY}/**/*.swift"

if [[ -n "$BASE" ]]; then
    merge_base="$(git merge-base HEAD "$BASE" 2>/dev/null || true)"
    if [[ -z "$merge_base" ]]; then
        echo "swift-changed-files.sh: cannot resolve a merge base with $BASE" >&2
        exit 1
    fi
    # Explicitly against HEAD, not against the working tree. `git diff <base>`
    # would fold uncommitted edits in silently, leaving `--worktree` with
    # nothing to mean but "also untracked" — and a flag that does not control
    # what it says it controls is how a caller ends up linting a set it did not
    # expect.
    git diff --name-only -z --diff-filter=ACMR "$merge_base" HEAD -- "$PATHSPEC"
elif git rev-parse --verify HEAD^1 >/dev/null 2>&1; then
    git diff-tree --no-commit-id --name-only --diff-filter=ACMR -r -z HEAD^1 HEAD -- "$PATHSPEC"
else
    git ls-files -z -- "$PATHSPEC"
fi

if [[ "$INCLUDE_WORKTREE" == "true" ]]; then
    git diff --name-only -z --diff-filter=ACMR HEAD -- "$PATHSPEC"
    git ls-files -z --others --exclude-standard -- "$PATHSPEC"
fi
