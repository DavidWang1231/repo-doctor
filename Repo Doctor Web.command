#!/bin/bash
set -e

cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required to run Repo Doctor Web."
  echo "Install Node.js from https://nodejs.org/ and try again."
  echo ""
  read -r -p "Press Enter to close..."
  exit 1
fi

node ./src/web-server.js
