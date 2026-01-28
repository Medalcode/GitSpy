#!/usr/bin/env bash
# Usage: simulate_worker_crash.sh [--pattern=worker.ts]
# This script will kill worker processes matching a pattern and optionally restart manually.

PATTERN=worker.ts
while [[ "$#" -gt 0 ]]; do
  case $1 in
    --pattern=*) PATTERN=${1#*=} ; shift ;;
    *) shift ;;
  esac
done

PIDS=$(pgrep -f "$PATTERN" || true)
if [[ -z "$PIDS" ]]; then
  echo "No worker processes found matching '$PATTERN'"
  exit 1
fi

echo "Killing worker processes: $PIDS"
for p in $PIDS; do
  kill -9 $p || true
done

echo "Workers killed. Start worker manually with: npm run start:worker"
