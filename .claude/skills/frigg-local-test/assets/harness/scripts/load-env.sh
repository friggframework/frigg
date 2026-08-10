#!/usr/bin/env bash
# Load .env values as environment variables WITHOUT clobbering variables that
# are already set in the process environment.
#
# Why: the agent-sandbox compose profile injects DB_TYPE / DATABASE_URL /
# STAGE (internal hostnames) into the container env. A plain `source .env`
# would overwrite those with the host-oriented values from .env.example,
# making migrate/db push inside the container target localhost:5433 and fail.
#
# Usage: source scripts/load-env.sh   (runs from the harness dir)
if [ -f .env ]; then
    while IFS= read -r line || [ -n "$line" ]; do
        # Skip blank lines and comments.
        case "$line" in
            '' | \#*) continue ;;
        esac
        key="${line%%=*}"
        # Only valid identifiers can be exported.
        case "$key" in
            *[!A-Za-z_0-9]* | [0-9]*) continue ;;
        esac
        # Export only if not already set in the environment.
        if [ -z "${!key+x}" ]; then
            export "$line"
        fi
    done < .env
fi
