#!/usr/bin/env bash
# Usage: send_duplicate_webhooks.sh [--count=N] [--same]
# --same: send the same delivery header for all requests (simulate duplicates)

COUNT=10
SAME=0
URL=http://localhost:3000/webhooks
CONTENT_TYPE=application/json
PAYLOAD='{"repository":{"full_name":"testorg/repo","name":"repo","owner":{"login":"testorg"}},"ref":"refs/heads/main"}'

while [[ "$#" -gt 0 ]]; do
  case $1 in
    --count=*) COUNT=${1#*=} ; shift ;;
    --same) SAME=1 ; shift ;;
    --url=*) URL=${1#*=} ; shift ;;
    *) shift ;;
  esac
done

# Compute a delivery id
if [[ $SAME -eq 1 ]]; then
  DELIVERY=$(cat /proc/sys/kernel/random/uuid)
fi

for i in $(seq 1 $COUNT); do
  if [[ $SAME -eq 0 ]]; then DELIVERY=$(cat /proc/sys/kernel/random/uuid); fi
  curl -s -X POST "$URL" \
    -H "Content-Type: $CONTENT_TYPE" \
    -H "x-github-event: push" \
    -H "x-hub-signature-256: sha256=deadbeef" \
    -H "x-github-delivery: $DELIVERY" \
    -d "$PAYLOAD" &
  sleep 0.05
done

wait

echo "Sent $COUNT webhooks to $URL (same=$SAME)"
