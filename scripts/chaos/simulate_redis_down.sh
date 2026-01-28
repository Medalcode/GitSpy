#!/usr/bin/env bash
# Usage: simulate_redis_down.sh [--name=gitspy-redis] [--down-time=10]
# Requires Docker and a redis container named accordingly.

NAME=gitspy-redis
DOWN=10
while [[ "$#" -gt 0 ]]; do
  case $1 in
    --name=*) NAME=${1#*=} ; shift ;;
    --down-time=*) DOWN=${1#*=} ; shift ;;
    *) shift ;;
  esac
done

echo "Stopping Redis container $NAME for $DOWN seconds"
docker stop $NAME || { echo "Failed to stop $NAME"; exit 1; }
sleep $DOWN
echo "Starting Redis container $NAME"
docker start $NAME || { echo "Failed to start $NAME"; exit 1; }
echo "Redis container $NAME restarted"
