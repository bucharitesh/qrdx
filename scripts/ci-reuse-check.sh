#!/usr/bin/env bash
# Decides whether this CI run can reuse an earlier passing run of the same code.
#
# Pushes to staging and to main run the full suite. A release pull request
# (staging -> main) and the push to main that merging it creates usually hold
# exactly the tree staging already tested, so testing it again only adds
# about 18 minutes to every release. This script looks for a completed,
# successful full run of this workflow on a commit with the same git tree as
# HEAD. If one is still running, it waits for it (up to CI_REUSE_WAIT_SECONDS)
# instead of starting a second copy of the same work.
#
# Writes hit=true|false (and run_url on a hit) to $GITHUB_OUTPUT, and a note
# to $GITHUB_STEP_SUMMARY. Any API or git error counts as a miss, so the full
# suite runs: the check can only skip work, never wave through untested code.
#
# Env: GITHUB_REPOSITORY, GITHUB_RUN_ID, GITHUB_OUTPUT, GITHUB_STEP_SUMMARY,
#      GH_TOKEN (needs actions: read), CI_WORKFLOW_FILE (default ci.yml),
#      CI_REUSE_WAIT_SECONDS (default 0).
set -uo pipefail

out="${GITHUB_OUTPUT:-/dev/stdout}"
summary="${GITHUB_STEP_SUMMARY:-/dev/stderr}"
workflow="${CI_WORKFLOW_FILE:-ci.yml}"
wait_seconds="${CI_REUSE_WAIT_SECONDS:-0}"
self_id="${GITHUB_RUN_ID:-0}"

miss() {
  echo "hit=false" >>"$out"
  echo "No earlier full run of this exact code passed${1:+ ($1)}, so the full suite runs." | tee -a "$summary"
  exit 0
}

tree="$(git rev-parse 'HEAD^{tree}' 2>/dev/null)" || miss "couldn't read the tree"

# The tree of a commit: from the local clone (CI checks out full history),
# else from the API.
tree_of() {
  git rev-parse "$1^{tree}" 2>/dev/null ||
    gh api "repos/$GITHUB_REPOSITORY/git/commits/$1" --jq .tree.sha 2>/dev/null
}

deadline=$((SECONDS + wait_seconds))
while :; do
  # Push runs are the full-suite runs (pushes to staging and main). The
  # newest 40 cover far more than the time between a merge and a release.
  runs="$(gh api "repos/$GITHUB_REPOSITORY/actions/workflows/$workflow/runs?event=push&per_page=40" \
    --jq '.workflow_runs[] | "\(.id) \(.head_sha) \(.status) \(.conclusion // "none") \(.html_url)"' 2>/dev/null)" ||
    miss "couldn't list earlier runs"

  pending=""
  while read -r id sha status conclusion url; do
    [ -n "${id:-}" ] || continue
    [ "$id" != "$self_id" ] || continue
    [ "$(tree_of "$sha")" = "$tree" ] || continue
    if [ "$status" = "completed" ]; then
      if [ "$conclusion" = "success" ]; then
        {
          echo "hit=true"
          echo "run_url=$url"
        } >>"$out"
        echo "This exact code (tree ${tree:0:12}) already passed the full suite in $url, so this run reuses that result." | tee -a "$summary"
        exit 0
      fi
    else
      pending="$url"
    fi
  done <<<"$runs"

  [ -n "$pending" ] || miss
  [ "$SECONDS" -lt "$deadline" ] || miss "a run of this code was still going after ${wait_seconds}s: $pending"
  echo "Waiting for $pending, which is testing this exact code..."
  sleep 30
done
