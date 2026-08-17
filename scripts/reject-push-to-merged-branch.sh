#!/bin/sh
# A branch whose pull request has already merged is finished. Pushing another
# commit to it recreates it on the remote, where nothing will ever merge it:
# GitHub does not reopen a merged PR, and the commit sits on a branch no one
# is watching while main carries the state from before the fix.
#
# Runs before the rest of the pre-push checks because it is the cheap one, and
# because there is no point verifying a push that should not happen.

branch=$(git rev-parse --abbrev-ref HEAD)

# Detached HEAD has no branch to look up.
[ "$branch" = "HEAD" ] && exit 0

command -v gh >/dev/null 2>&1 || exit 0

merged=$(gh pr list --head "$branch" --state merged --json number \
  --jq '.[0].number' 2>/dev/null) || exit 0

# Fail open on anything short of a definite answer — offline, unauthenticated,
# rate-limited. This is a guard rail, and one that strands you on a plane is
# worse than one that occasionally lets a mistake through.
[ -z "$merged" ] && exit 0

cat >&2 <<EOF

  Refusing to push: PR #${merged} for '${branch}' is already merged.

  That PR will not pick this commit up, and the branch is not going to merge
  again. Put the work on a new branch cut from the current base instead:

      git checkout -b <new-branch> origin/main
      git cherry-pick ${branch}

  If you really mean it: git push --no-verify

EOF
exit 1
