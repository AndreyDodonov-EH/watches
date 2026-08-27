#!/usr/bin/env bash
# Build + flash the app. Board attached to WSL/Linux (/dev/ttyACM*) -> pio upload; else -> flash-win.sh
# (board on the Windows side, via python.exe esptool). NVS (tuned params) is preserved either way.
set -euo pipefail
cd "$(dirname "$0")/.."
if ls /dev/ttyACM* >/dev/null 2>&1; then
    ~/.platformio/penv/bin/pio run -s -t upload --upload-port "$(ls /dev/ttyACM* | head -1)" "$@"
else
    exec tools/flash-win.sh "$@"
fi
