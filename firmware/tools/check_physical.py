#!/usr/bin/env python3
"""Headless checks for the shared physical renderer.

This compiles the TypeScript reference and a dependency-free native harness,
then compares complete RGB565 frames for bounded representative scenes.  The
native harness uses fixed storage just like the firmware path; all temporary
build and frame files live below the system temporary directory.
"""

from __future__ import annotations

import json
import math
import shutil
import struct
import subprocess
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SIM = ROOT / "sim"
TS_CONFIG = SIM / "tools" / "check-physical.tsconfig.json"
TS_CACHE = SIM / "node_modules" / ".cache" / "check-physical"
TS_ENTRY = TS_CACHE / "sim" / "tools" / "check-physical.js"
HOST_SOURCE = ROOT / "firmware" / "tools" / "physical-host.cpp"
RENDER_SOURCE = ROOT / "firmware" / "src" / "physical" / "render.cpp"
W, PANEL_H = 536, 240


def run(command: list[str], *, cwd: Path = ROOT, input_data: bytes | None = None) -> subprocess.CompletedProcess[bytes]:
    result = subprocess.run(command, cwd=cwd, input=input_data, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode != 0:
        detail = result.stderr.decode("utf-8", "replace").strip()
        raise RuntimeError(f"command failed ({result.returncode}): {' '.join(command)}\n{detail}")
    return result


def compile_typescript() -> None:
    run([str(SIM / "node_modules" / ".bin" / "tsc"), "--project", str(TS_CONFIG)])
    # tsc preserves the @spec alias in CommonJS output.  Keep the shim inside
    # the disposable cache, matching the existing render-ref check pattern.
    compiled_layout = TS_CACHE / "spec" / "layout.js"
    alias = TS_CACHE / "node_modules" / "@spec" / "layout.js"
    alias.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(compiled_layout, alias)
    (TS_CACHE / "package.json").write_text("{}\n", encoding="utf-8")
    if not TS_ENTRY.exists():
        raise RuntimeError(f"TypeScript check output missing: {TS_ENTRY}")


def compile_native(directory: Path) -> Path:
    executable = directory / "physical-host"
    run([
        "g++", "-std=gnu++17", "-O2", "-Wall", "-Wextra", "-Werror",
        "-I", str(ROOT / "firmware" / "src" / "physical"),
        str(HOST_SOURCE), str(RENDER_SOURCE), "-o", str(executable), "-lm",
    ])
    return executable


def schema_defaults() -> dict[str, float]:
    schema = json.loads((ROOT / "spec" / "physical-schema.json").read_text(encoding="utf-8"))
    return {field["key"]: field["default"] for field in schema["fields"]}


def scene_params(base: dict[str, float], changes: dict[str, float]) -> dict[str, float]:
    params = dict(base)
    params.update(changes)
    return params


def scenes(base: dict[str, float]) -> list[tuple[str, dict[str, float], float, float]]:
    return [
        ("default", scene_params(base, {}), 0.43, 0.57),
        ("fill-zero", scene_params(base, {}), 0.0, 0.0),
        ("fill-one", scene_params(base, {}), 1.0, 1.0),
        ("fill-mid", scene_params(base, {}), 0.43, 0.57),
        ("water", scene_params(base, {"liquidIor": 1.333, "absorptionR": 0, "absorptionG": 0, "absorptionB": 0}), 0.43, 0.57),
        ("matched-indices", scene_params(base, {"liquidIor": 1, "wallIor": 1, "absorptionR": 0, "absorptionG": 0, "absorptionB": 0}), 0.43, 0.57),
        ("high-absorption", scene_params(base, {"absorptionR": 3, "absorptionG": 3, "absorptionB": 3}), 0.43, 0.57),
        ("small-tube", scene_params(base, {"innerRadiusMm": 0.5, "wallThicknessMm": 0.05}), 0.43, 0.57),
        ("maximum-height", scene_params(base, {"innerRadiusMm": 3, "wallThicknessMm": 0.3, "minutesY": 160}), 0.43, 0.57),
        # Deliberately lands at the positive .5 rounding boundary.  This
        # catches drift between JS Math.round and C++ roundf near float edges.
        ("rounding-edge", scene_params(base, {"innerRadiusMm": 1.67225, "wallThicknessMm": 0.05}), 0.43, 0.57),
        ("edge-light", scene_params(base, {"lightAngleDeg": 85, "lightSizeDeg": 5, "lightIntensity": 5}), 0.43, 0.57),
    ]


def height(params: dict[str, float]) -> int:
    return math.floor(2 * (params["innerRadiusMm"] + params["wallThicknessMm"]) / 0.083 + 0.5)


def host_args(params: dict[str, float], fill_h: float, fill_m: float) -> list[str]:
    return [*(f"{key}={value:.15g}" for key, value in params.items()), f"hoursFill={fill_h:.15g}", f"minutesFill={fill_m:.15g}"]


def layout_args(params: dict[str, float]) -> list[str]:
    return [*(f"{key}={value:.15g}" for key, value in params.items())]


def decode_native(data: bytes, params: dict[str, float]) -> list[int]:
    h = height(params)
    expected = 2 * W * h * 2
    if len(data) != expected:
        raise RuntimeError(f"native frame length {len(data)} != {expected} for H={h}")
    words = struct.unpack(f"<{2 * W * h}H", data)
    frame = [0] * (W * PANEL_H)
    for tube, y0 in enumerate((int(params["hoursY"]), int(params["minutesY"]))):
        for row in range(h):
            source = tube * W * h + row * W
            destination = (y0 + row) * W
            for x in range(W):
                swapped = words[source + x]
                frame[destination + x] = ((swapped & 0xFF) << 8) | (swapped >> 8)
    return frame


def compare_frames(native: list[int], typescript: bytes, params: dict[str, float], name: str) -> None:
    expected_bytes = W * PANEL_H * 2
    if len(typescript) != expected_bytes:
        raise RuntimeError(f"{name}: TypeScript frame length {len(typescript)} != {expected_bytes}")
    reference = struct.unpack(f"<{W * PANEL_H}H", typescript)
    h = height(params)
    max_diff = 0
    bad = 0
    first_bad: tuple[int, tuple[int, int, int], tuple[int, int, int]] | None = None
    for index, (actual, expected) in enumerate(zip(native, reference)):
        ac = ((actual >> 11) & 31, (actual >> 5) & 63, actual & 31)
        ec = ((expected >> 11) & 31, (expected >> 5) & 63, expected & 31)
        diff = max(abs(a - e) for a, e in zip(ac, ec))
        max_diff = max(max_diff, diff)
        if diff > 1:
            bad += 1
            if first_bad is None: first_bad = (index, ac, ec)
    if bad:
        raise RuntimeError(f"{name}: {bad} pixels exceed 1 RGB565 channel LSB (max {max_diff}, first {first_bad})")
    # The native output only contains the two strips.  Check that the TS
    # renderer leaves the bridge and all rows outside those strips untouched.
    occupied = set()
    for y0 in (int(params["hoursY"]), int(params["minutesY"])):
        occupied.update(range(y0, y0 + h))
    for y in range(PANEL_H):
        if y not in occupied and any(reference[y * W + x] != 0 for x in range(W)):
            raise RuntimeError(f"{name}: nonzero pixel outside physical strips at row {y}")


def main() -> int:
    run(["python3", str(ROOT / "firmware" / "tools" / "gen_physical.py"), "--check"])
    compile_typescript()
    run(["node", str(TS_ENTRY)])
    base = schema_defaults()
    with tempfile.TemporaryDirectory(prefix="liquid-watch-physical-") as temp:
        temp_path = Path(temp)
        native = compile_native(temp_path)
        run([str(native), "--self-test"])
        for name, params, fill_h, fill_m in scenes(base):
            job = temp_path / f"{name}.json"
            ts_frame = temp_path / f"{name}.ts.rgb565"
            job.write_text(json.dumps({"params": params, "hours": fill_h, "minutes": fill_m}), encoding="utf-8")
            ts_height = int(run(["node", str(TS_ENTRY), "--layout", str(job)]).stdout.decode().strip())
            native_height = int(run([str(native), "--layout", *layout_args(params)]).stdout.decode().strip())
            python_height = height(params)
            if (ts_height, native_height, python_height) != (ts_height, ts_height, ts_height):
                raise RuntimeError(f"{name}: layout rounding mismatch TS={ts_height} native={native_height} Python={python_height}")
            run(["node", str(TS_ENTRY), "--frame", str(job), str(ts_frame)])
            native_frame = run([str(native), *host_args(params, fill_h, fill_m)]).stdout
            compare_frames(decode_native(native_frame, params), ts_frame.read_bytes(), params, name)
            print(f"physical frame {name}: ok")
    print("physical native/TypeScript checks: ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
