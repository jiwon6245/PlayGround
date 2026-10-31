#!/usr/bin/env bash
# Project startup: install dependencies, build static output into dist/,
# write deployment metadata, then serve in the foreground on PORT (default 3000).
set -euo pipefail

cd "$(dirname "$0")"
PROJECT_DIR="$(pwd)"

export PORT="${PORT:-3000}"

# 1. Install dependencies (no-op when package.json has no deps; kept for parity).
/usr/bin/time -p npm install --no-audit --no-fund

# 2. Build the static site into the built output directory inside PROJECT_DIR.
/usr/bin/time -p npm run build

# 3. Write deployment metadata for the worker/controller (worker metadata only).
DEPLOYMENT_OUTPUT="${OPENCODE_WEB_DIR:?OPENCODE_WEB_DIR is required}/deployment-output.json"
BUILD_DIR="$PROJECT_DIR/dist"
/usr/bin/time -p env DEPLOYMENT_OUTPUT="$DEPLOYMENT_OUTPUT" PROJECT_DIR="$PROJECT_DIR" BUILD_DIR="$BUILD_DIR" node -e '
  const fs = require("fs");
  fs.writeFileSync(process.env.DEPLOYMENT_OUTPUT, JSON.stringify({ project: process.env.PROJECT_DIR, directory: process.env.BUILD_DIR }, null, 2) + "\n");
'

echo "[start.sh] PROJECT_DIR=$PROJECT_DIR"
echo "[start.sh] BUILD_DIR=$BUILD_DIR"
echo "[start.sh] Serving on port $PORT"

# 4. Serve the built output in the foreground.
exec node server.js
