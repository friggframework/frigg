#!/usr/bin/env bash
#
# PreToolUse(Bash) guard for Frigg.
#
# Blocks `gh pr create` unless the command includes the "release" label, so every
# Frigg PR carries the tag that triggers a release on merge. Add `--label release`
# (or include `release` in your `--label`/`-l` list) to pass.
#
# Reads the hook payload as JSON on stdin and, when it decides to block, prints a
# PreToolUse "deny" decision. Any other command is allowed (exit 0, no output).
set -uo pipefail

input=$(cat)

# Cheap pre-filter: the overwhelming majority of Bash commands are not PR creates.
# Bail before spawning jq/node/grep unless the raw payload even mentions "pr create".
case "$input" in
    *"pr create"*) ;;
    *) exit 0 ;;
esac

# Precisely pull out the command string. Prefer jq, fall back to node, and finally
# to the raw payload so the guard still functions if neither is installed.
extract_command() {
    if command -v jq >/dev/null 2>&1; then
        printf '%s' "$input" | jq -r '.tool_input.command // ""' 2>/dev/null && return 0
    fi
    if command -v node >/dev/null 2>&1; then
        printf '%s' "$input" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).tool_input?.command||"")}catch{process.stdout.write("")}})' 2>/dev/null && return 0
    fi
    printf '%s' "$input"
}
cmd=$(extract_command)

# Confirm this is a `gh pr create` *invocation*, not just a command that mentions
# the phrase (e.g. a commit message or echo). Require it at a command position:
# start of a line, or right after a shell separator ; & | ( -- which also covers
# && and ||. Mentions sitting inside quotes/backticks therefore won't match.
if ! printf '%s' "$cmd" | grep -Eq '(^|[;&|(])[[:space:]]*gh[[:space:]]+pr[[:space:]]+create([[:space:]]|$)'; then
    exit 0
fi

# Collect every value passed to --label / -l. Two passes keep the long and short
# forms unambiguous (the short pass requires a boundary before -l, so it never
# matches the "-l" inside "--label"). Handles `=`, quotes, comma lists, and repeats.
labels=$(
    {
        printf '%s' "$cmd" | grep -oE -- '(^|[[:space:]])--label([[:space:]]*=?[[:space:]]*)("[^"]*"|'\''[^'\'']*'\''|[^[:space:]]+)' \
            | sed -E 's/^[[:space:]]*--label[[:space:]]*=?[[:space:]]*//'
        printf '%s' "$cmd" | grep -oE -- '(^|[[:space:]])-l([[:space:]]*=?[[:space:]]*)("[^"]*"|'\''[^'\'']*'\''|[^[:space:]]+)' \
            | sed -E 's/^[[:space:]]*-l[[:space:]]*=?[[:space:]]*//'
    } \
        | tr -d '"'\''' \
        | tr ',' '\n' \
        | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//'
)

if printf '%s\n' "$labels" | grep -qxF 'release'; then
    exit 0
fi

cat <<'JSON'
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Frigg requires every pull request to carry the \"release\" label (it triggers a release when the PR merges). Re-run `gh pr create` with `--label release` added to your labels. If this PR should intentionally NOT bump a version, use the repo's `skip-release` label and update .claude/hooks/require-release-label.sh accordingly."
  }
}
JSON
exit 0
