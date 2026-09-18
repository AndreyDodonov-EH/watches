#!/usr/bin/env python3
"""Compare the active physical device frame with the TypeScript reference.

Read-only by default. --scene explicitly sets a fixed test scene (useful when
opening a serial port resets the board). Writes PNGs and a job below --out.
"""
import argparse
import json
import struct
from pathlib import Path

from PIL import Image

from check_physical import W, PANEL_H, TS_ENTRY, compile_typescript, compare_frames, height, run, schema_defaults
from device import Device


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port')
    parser.add_argument('--scene', choices=['oil', 'water', 'maximum'])
    parser.add_argument('--out', type=Path, default=Path('firmware/.compare/physical'))
    args = parser.parse_args()
    compile_typescript()
    with Device(args.port) as device:
        caps = json.loads(device.talk('V'))
        if args.scene:
            if caps.get('physical') != 1:
                raise RuntimeError('Device does not support physical rendering.')
            candidate = schema_defaults()
            if args.scene == 'water':
                candidate.update(liquidIor=1.333, absorptionR=0, absorptionG=0, absorptionB=0)
            elif args.scene == 'maximum':
                candidate.update(innerRadiusMm=3, wallThicknessMm=0.3, minutesY=160)
            for command in ['Pbegin', *(f'P {k}={v}' for k, v in candidate.items()),
                            'Pcommit', 'R physical']:
                reply = device.talk(command)
                if not reply.startswith('ok'):
                    device.talk('Pcancel')
                    raise RuntimeError(f'{command}: {reply}')
            device.talk('d0')
            device.talk('t 10:09:00')
            caps = json.loads(device.talk('V'))
        if caps.get('physical') != 1 or caps.get('renderer') != 'physical':
            raise RuntimeError('Select the physical renderer before capturing.')
        params = json.loads(device.talk('P?'))
        dump = device.talk('X', end='END', timeout=60).splitlines()
    header = dump[0].split()
    if len(header) != 6 or header[0] != 'PHYSICAL':
        raise RuntimeError(f'Invalid physical dump header: {dump[0]}')
    h, yh, ym = map(int, header[1:4])
    if (h, yh, ym) != (height(params), params['hoursY'], params['minutesY']):
        raise RuntimeError('Configuration changed during capture; retry.')
    if len(dump) != 2 * h + 2 or dump[-1] != 'END':
        raise RuntimeError('Incomplete physical dump.')
    frame = [0] * (W * PANEL_H)
    for tube, y0 in enumerate((yh, ym)):
        for row in range(h):
            line = dump[1 + tube * h + row]
            if len(line) != W * 4:
                raise RuntimeError(f'Incomplete tube {tube}, row {row}.')
            frame[(y0 + row) * W:(y0 + row + 1) * W] = [
                int(line[x:x + 4], 16) for x in range(0, len(line), 4)
            ]
    args.out.mkdir(parents=True, exist_ok=True)
    job = args.out / 'job.json'
    job.write_text(json.dumps({'params': params, 'hours': float(header[4]),
                               'minutes': float(header[5])}, indent=2) + '\n')
    reference_path = args.out / 'reference.rgb565'
    run(['node', str(TS_ENTRY), '--frame', str(job.resolve()), str(reference_path.resolve())])
    reference = reference_path.read_bytes()
    expected = struct.unpack(f'<{W * PANEL_H}H', reference)

    def rgb(words):
        return bytes(channel for word in words for channel in (
            round(((word >> 11) & 31) * 255 / 31),
            round(((word >> 5) & 63) * 255 / 63), round((word & 31) * 255 / 31)))

    actual_rgb, expected_rgb = rgb(frame), rgb(expected)
    for name, data in [('device', actual_rgb), ('reference', expected_rgb),
                       ('diff', bytes(min(255, abs(a - b) * 8)
                                      for a, b in zip(actual_rgb, expected_rgb)))]:
        Image.frombytes('RGB', (W, PANEL_H), data).save(args.out / f'{name}.png')
    compare_frames(frame, reference, params, 'device')
    changed = sum(a != b for a, b in zip(frame, expected))
    print(f'Physical device parity: PASS (≤1 RGB565 channel LSB; {changed} nonidentical pixels).')
    print(f'Artifacts: {args.out}')


if __name__ == '__main__':
    main()
