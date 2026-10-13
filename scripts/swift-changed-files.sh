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

# Every path below is repository-relative, and a pathspec is resolved against
# the process cwd — so called from a subdirectory (which is where an iOS agent
# works) the pathspec would match nothing and this would exit 0 with an empty
# list. A gate that reports clean because it was standing in the wrong place is
# the failure this script exists to remove.
top_level="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$top_level" ]]; then
    echo "swift-changed-files.sh: not inside a git repository" >&2
    exit 1
fi
cd "$top_level"

# Trailing slashes would produce `apps/ios//**/*.swift`, which matches nothing.
WORKING_DIRECTORY="${WORKING_DIRECTORY%/}"

# `:(glob)` is the whole point of naming this in one place. Without it `**/` is
# an ordinary two-star sequence with no zero-directory meaning, so
# `apps/ios/Top.swift` does not match and is silently skipped.
PATHSPEC=":(glob)${WORKING_DIRECTORY}/**/*.swift"

# The sources that can disagree with the disk are filtered; the one that defines
# what is being linted is not.
#
# Asking what a branch changed compares two commits, so a file the branch added
# and the developer has since deleted or renamed uncommitted survives that
# comparison. `diff HEAD` can do it too, though only through `skip-worktree` —
# the mechanism sparse checkout is built on — where git stops consulting the
# worktree and answers from the index. Either way, handing swift-format a path
# that does not exist fails the local check for a state CI would call clean,
# which is the inverse of the bug this script was written to remove. Neither
# filter can drop work a developer is actually doing: a file being edited exists
# by construction.
#
# The commit-oriented answer is never filtered, whatever else was asked. Its
# paths come from the commit being linted, so the filter would almost always do
# nothing — and in the one case it would not, a sparse checkout whose cone omits
# a changed Swift file, dropping it silently turns a missing-file error into a
# clean run. A gate reporting nothing to do because it could not see the work is
# the failure this repository keeps writing down.
#
# `ls-files --others` is left alone: it lists directory entries that exist. A
# broken symlink among them survives here and fails at swift-format, loudly,
# which is the right direction for something nobody meant to lint.
existing_only() {
    while IFS= read -r -d "" path; do
        if [[ -e "$path" ]]; then
            printf '%s\0' "$path"
        fi
    done
}

emit() {
    if [[ -n "$BASE" ]]; then
        merge_base="$(git merge-base HEAD "$BASE" 2>/dev/null || true)"
        if [[ -z "$merge_base" ]]; then
            echo "swift-changed-files.sh: cannot resolve a merge base with $BASE" >&2
            exit 1
        fi
        # Explicitly against HEAD, not the working tree. `git diff <base>` folds
        # uncommitted edits in silently, leaving `--worktree` with nothing to
        # mean but "also untracked" — and a flag that does not control what it
        # says it controls is how a caller lints a set it did not expect.
        git diff --name-only -z --diff-filter=ACMR "$merge_base" HEAD -- "$PATHSPEC" | existing_only
    elif git rev-parse --verify HEAD^1 >/dev/null 2>&1; then
        git diff-tree --no-commit-id --name-only --diff-filter=ACMR -r -z HEAD^1 HEAD -- "$PATHSPEC"
    else
        git ls-files -z -- "$PATHSPEC"
    fi

    if [[ "$INCLUDE_WORKTREE" == "true" ]]; then
        git diff --name-only -z --diff-filter=ACMR HEAD -- "$PATHSPEC" | existing_only
        git ls-files -z --others --exclude-standard -- "$PATHSPEC"
    fi
}

# Deduplicated, because a file changed on the branch and still being edited
# appears in two of the sources above — the normal state of the developer loop
# this serves — and swift-format would report its every diagnostic twice.
emit | sort -zu
