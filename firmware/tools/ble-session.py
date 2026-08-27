#!/usr/bin/env python3
"""Talk to liquid-watch over BLE (Nordic UART) from the Windows radio — WSL has none, so run it with
Windows python (needs `python.exe -m pip install bleak`):
    python.exe "$(wslpath -w firmware/tools/ble-session.py)" s f "p?"
Connects, subscribes to TX notifications, writes each command to RX, prints the replies, disconnects.
Check the serial side afterwards (tools/device.py s): no `BOARD REBOOTED`, clock still running."""
import asyncio, sys
from bleak import BleakClient, BleakScanner
RX='6e400002-b5a3-f393-e0a9-e50e24dcca9e'; TX='6e400003-b5a3-f393-e0a9-e50e24dcca9e'
async def main():
    dev = await BleakScanner.find_device_by_name('liquid-watch', timeout=15)
    if not dev: print('not found'); return
    got = []
    async with BleakClient(dev) as c:
        print('connected mtu', c.mtu_size)
        await c.start_notify(TX, lambda h, d: got.append(bytes(d)))
        for cmd in sys.argv[1:]:
            await c.write_gatt_char(RX, (cmd + '\n').encode(), response=True); await asyncio.sleep(0.6)
    print(b''.join(got).decode(errors='replace').replace('\r\n','\n').strip()); print('disconnected')
asyncio.run(main())
