#!/usr/bin/env bash
# Usage: run_partial_replay.sh [--from=TIMESTAMP] [--to=TIMESTAMP] [--repo=owner/repo] [--dry-run]

ARGS=()
for a in "$@"; do ARGS+=("$a"); done

node scripts/replay_events.js "${ARGS[@]}"
