#!/usr/bin/env bash
# Capture desktop + mobile screenshots of the running app.
# Reads CAPTURE_URL and CAPTURE_DIR from the environment.
# Writes final-desktop.png and final-mobile.png into CAPTURE_DIR (outside source).
# Exits 75 for temporary navigation/browser infrastructure failures,
#        1  for script or rendering defects.
# Leaves the app server running; closes its own browser.
set -euo pipefail

cd "$(dirname "$0")"
PROJECT_DIR="$(pwd)"

: "${CAPTURE_URL:?CAPTURE_URL environment variable is required}"
: "${CAPTURE_DIR:?CAPTURE_DIR environment variable is required}"

export RUNTIME_DIR="${RUNTIME_DIR:-/home/runner/work/_temp/omgithub-runtime}"

echo "[capture.sh] CAPTURE_URL=$CAPTURE_URL"
echo "[capture.sh] CAPTURE_DIR=$CAPTURE_DIR"
echo "[capture.sh] RUNTIME_DIR=$RUNTIME_DIR"

/usr/bin/time -p mkdir -p "$CAPTURE_DIR"

# Run the browser capture. default-capture.mjs opens the exact URL, waits for
# rendered content, captures desktop (1440x900) and mobile (390x844) views as
# final-desktop.png / final-mobile.png, then closes the browser. The app
# server is NOT started or stopped here; it is expected to already be running.
/usr/bin/time -p node "${RUNTIME_DIR}/scripts/default-capture.mjs"

echo "[capture.sh] Capture complete."
