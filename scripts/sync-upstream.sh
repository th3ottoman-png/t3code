#!/usr/bin/env bash
#
# Rebase the local agent presets onto upstream T3 Code, then prove the patch still holds.
#
# Upstream merges dozens of commits a day, so this patch is only worth keeping if it rebases
# cleanly and stays inside its own files. Run this after `git fetch upstream`, or on a schedule.
#
#   scripts/sync-upstream.sh              # fetch, rebase, install, typecheck, test, audit
#   scripts/sync-upstream.sh --check-only # audit the current diff without touching history
#
# On a conflict the rebase is left in place on purpose: resolving it here would hide which of our
# hunks upstream changed underneath us. `git rebase --abort` puts the branch back.
set -euo pipefail

BRANCH="${BRANCH:-feat/local-agent-presets}"
UPSTREAM_REMOTE="${UPSTREAM_REMOTE:-upstream}"
UPSTREAM_BRANCH="${UPSTREAM_BRANCH:-main}"

# Every file this patch is allowed to touch. A change outside this list means the patch has grown a
# new responsibility, which is the thing that makes a fork expensive to maintain.
ALLOWED_FILES="
packages/provider-acp-registry/src/presets.ts
packages/provider-acp-registry/src/presets.test.ts
packages/provider-acp-registry/src/server/presetDiscovery.ts
packages/provider-acp-registry/src/server/presetDiscovery.test.ts
packages/provider-acp-registry/package.json
apps/web/package.json
pnpm-lock.yaml
apps/web/src/components/settings/AcpRegistrySearchStep.tsx
apps/web/src/components/settings/AddProviderInstanceDialog.tsx
apps/web/src/components/settings/AddProviderInstanceDialog.logic.ts
apps/web/src/components/settings/AddProviderInstanceDialog.test.ts
apps/web/src/components/settings/AddProviderInstanceDialog.environment.browser.test.tsx
docs/user/providers-acp.md
docs/user/install.md
docs/user/permission-modes.md
docs/internals/adding-a-provider.md
scripts/sync-upstream.sh
"

CHECK_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --check-only) CHECK_ONLY=1 ;;
    -h|--help) sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

cd "$(dirname "$0")/.."
root=$(git rev-parse --show-toplevel)
cd "$root"

log() { printf '\n\033[1m%s\033[0m\n' "$*"; }
warn() { printf '\033[33m%s\033[0m\n' "$*"; }

vp_bin() {
  export PATH="$HOME/.local/share/vite-plus/bin:$PATH"
  command -v vp >/dev/null || {
    warn "vp is not on PATH. Install it with: curl -fsSL https://vite.plus | bash"
    exit 1
  }
}

audit_diff() {
  local base="$1" unexpected=""
  log "Auditing the patch against $base"
  for file in $(git diff --name-only "$base"...HEAD); do
    case "$(printf '%s\n' "$ALLOWED_FILES")" in
      *"$file"*) ;;
      *) unexpected="$unexpected $file" ;;
    esac
  done
  if [ -n "$unexpected" ]; then
    warn "Files outside the agreed patch surface:$unexpected"
    warn "Move this work out of the fork, or add the file here once you have decided it belongs."
    return 1
  fi
  echo "Patch touches only the agreed files."
}

run_checks() {
  log "Installing workspace dependencies"
  vp_bin
  vp i

  log "Typechecking provider-acp-registry"
  (cd packages/provider-acp-registry && vpr typecheck)

  log "Testing provider-acp-registry"
  (cd packages/provider-acp-registry && vpr test)

  log "Typechecking apps/web"
  (cd apps/web && vpr typecheck)

  log "Testing the Add provider surface"
  (cd apps/web && vpr test src/components/settings)
}

log "Fetching $UPSTREAM_REMOTE"
git fetch "$UPSTREAM_REMOTE" --tags

if [ "$CHECK_ONLY" -eq 1 ]; then
  audit_diff "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH"
  exit 0
fi

current=$(git rev-parse --abbrev-ref HEAD)
if [ "$current" != "$BRANCH" ]; then
  warn "On '$current', expected '$BRANCH'. Set BRANCH=... to override."
  exit 1
fi

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  warn "Working tree has uncommitted changes. Commit or stash them first."
  exit 1
fi

behind=$(git rev-list --count "HEAD..$UPSTREAM_REMOTE/$UPSTREAM_BRANCH")
log "$behind upstream commit(s) not in this branch"
git --no-pager log --oneline "HEAD..$UPSTREAM_REMOTE/$UPSTREAM_BRANCH" | head -20

if [ "$behind" -eq 0 ]; then
  audit_diff "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH"
  run_checks
  log "Nothing to rebase; branch is current."
  exit 0
fi

log "Rebasing onto $UPSTREAM_REMOTE/$UPSTREAM_BRANCH"
if ! git rebase "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH"; then
  warn "Rebase stopped. Conflicted files:"
  git diff --name-only --diff-filter=U | sed 's/^/  /'
  warn "Resolve, then: git rebase --continue   (or git rebase --abort to back out)"
  exit 1
fi

audit_diff "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH"
run_checks

log "Done"
echo "Branch '$BRANCH' is rebased on $UPSTREAM_REMOTE/$UPSTREAM_BRANCH with $(git rev-list --count "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH..HEAD") commit(s) of our own."
echo "Push with: git push --force-with-lease origin $BRANCH"
