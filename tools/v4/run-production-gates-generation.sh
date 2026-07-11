#!/bin/sh
set -eu

repo_root="$(pwd)"
health_url="${V4_API_HEALTH_URL:-http://127.0.0.1:33100/api/health}"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --repo-root)
      repo_root="${2:-$repo_root}"
      shift 2
      ;;
    --health-url)
      health_url="${2:-$health_url}"
      shift 2
      ;;
    *)
      echo "unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

latencies=""
attempt=1
while [ "$attempt" -le 5 ]; do
  sample="$(curl -s -o /dev/null -w '%{time_total}' "$health_url" || true)"
  if [ -n "$sample" ]; then
    ms="$(awk "BEGIN { printf \"%d\", $sample * 1000 }")"
    if [ "$ms" -gt 0 ]; then
      if [ -z "$latencies" ]; then
        latencies="$ms"
      else
        latencies="$latencies,$ms"
      fi
    fi
  fi
  attempt=$((attempt + 1))
done

node --import tsx tools/v4/run-production-gates-generation.mjs \
  --repo-root "$repo_root" \
  --health-url "$health_url" \
  --health-probe-latencies "$latencies"
