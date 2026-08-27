#!/usr/bin/env bash
# End-to-end firmware check: build -> flash -> pinned fps bench -> pixel parity vs the sim.
#   tools/e2e.sh [--label TEXT] [--stages] [--no-ble] [--no-flash] [--samples N]
# Appends the bench line + parity line to firmware/.compare/e2e.log. Board must be reachable (device.py).
set -euo pipefail
cd "$(dirname "$0")/.."
LABEL="$(git rev-parse --short HEAD)$(git diff --quiet || echo '+dirty')"; STAGES=(); FLASH=1; SAMPLES=5; FLAGS=""
while [ $# -gt 0 ]; do
    case "$1" in
        --label) LABEL="$2"; shift ;;
        --stages) STAGES=(--stages) ;;
        --no-ble) FLAGS="-DNO_BLE"; LABEL="$LABEL no-ble" ;;
        --no-flash) FLASH=0 ;;
        --samples) SAMPLES="$2"; shift ;;
        *) echo "usage: $0 [--label TEXT] [--stages] [--no-ble] [--no-flash] [--samples N]"; exit 2 ;;
    esac; shift
done
if [ "$FLASH" -eq 1 ]; then
    PLATFORMIO_BUILD_FLAGS="$FLAGS" tools/flash.sh
    sleep 4
fi
mkdir -p .compare
{
    echo "== $(date '+%F %T')  $LABEL"
    python3 tools/bench.py --samples "$SAMPLES" --label "$LABEL" "${STAGES[@]}"
    python3 tools/compare-device.py | grep '^mismatched'
} | tee -a .compare/e2e.log
