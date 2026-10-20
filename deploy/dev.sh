#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: npm run dev -- <app-name> [--live] [--port <port>]" >&2
  exit 1
fi

node deploy/dev-session.mjs start "$@"
