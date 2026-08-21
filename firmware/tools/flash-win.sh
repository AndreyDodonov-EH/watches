#!/usr/bin/env bash
# Flash from WSL through Windows' esptool: the board stays on the Windows side (Web Serial in the
# browser keeps working), no usbipd attach/detach. Needs once: python.exe -m pip install esptool
# Usage: tools/flash-win.sh [--full] [COMx]
# Default: flash the application only, preserving NVS. --full flashes the factory image.
set -euo pipefail
cd "$(dirname "$0")/.."
FULL=0
PORT=""
for ARG in "$@"; do
    case "$ARG" in
        --full) FULL=1 ;;
        COM[0-9]*) PORT="$ARG" ;;
        *) echo "usage: tools/flash-win.sh [--full] [COMx]"; exit 2 ;;
    esac
done
PORT="${PORT:-$(powershell.exe -NoProfile -c "(Get-PnpDevice -Class Ports -PresentOnly | Where-Object InstanceId -like 'USB\VID_303A*' | Select-Object -First 1).FriendlyName -replace '.*\((COM\d+)\).*','\$1'" | tr -d '\r')}"
[ -n "$PORT" ] || { echo "no Espressif COM port found"; exit 1; }
~/.platformio/penv/bin/pio run -s
if [ "$FULL" -eq 1 ]; then
    OFFSET=0x0
    IMAGE=.pio/build/amoled191/firmware.factory.bin
else
    OFFSET=0x10000
    IMAGE=.pio/build/amoled191/firmware.bin
fi
python.exe -m esptool --chip esp32s3 --port "$PORT" --baud 921600 write-flash "$OFFSET" "$(wslpath -w "$IMAGE")"
