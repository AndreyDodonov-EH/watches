#!/usr/bin/env bash
# Flash from WSL through Windows' esptool: the board stays on the Windows side (Web Serial in the
# browser keeps working), no usbipd attach/detach. Needs once: python.exe -m pip install esptool
# Usage: tools/flash-win.sh [COMx]   (default: first Espressif VID_303A port; builds first)
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${1:-$(powershell.exe -NoProfile -c "(Get-PnpDevice -Class Ports -PresentOnly | Where-Object InstanceId -like 'USB\VID_303A*' | Select-Object -First 1).FriendlyName -replace '.*\((COM\d+)\).*','\$1'" | tr -d '\r')}"
[ -n "$PORT" ] || { echo "no Espressif COM port found"; exit 1; }
~/.platformio/penv/bin/pio run -s
IMG=$(wslpath -w .pio/build/amoled191/firmware.factory.bin)
python.exe -m esptool --chip esp32s3 --port "$PORT" --baud 921600 write-flash 0x0 "$IMG"
