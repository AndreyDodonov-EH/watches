# Tick and digit rendering shortcuts (2026-09-22)

Small firmware-only changes on top of the residue math optimizations. No baked images,
new buffers, caches, or allocations; rendering order, coverage, and colour rounding stay
unchanged.

- Draw ticks with zero parallax directly as vertical segments. This includes dry ticks
  even while the liquid is tilted. Skip lens-depth square roots and line interpolation.
- For a one-pixel step along a refracted tick, plot the integer endpoint directly. Keep
  the old interpolation for larger steps and preserve repeated points (important for
  translucent emboss strokes).
- For integer digit refraction shifts, use the single contributing sample directly.
  For fractional shifts, form the four bilinear weight products once per glyph.
- Blend red and blue together in two 16-bit lanes in the shared RGB565 helper, reducing
  three channel multiplies to two. Preserve RGB888 expansion, rounding, and endpoint clamps.
- Skip both luminance calculations when the mark contrast floor is zero. The RGB blend
  still uses exactly the same channel expansion and rounding.

## Validation

`python3 firmware/tools/check_render_frames.py --reference /tmp/watches-render-perf/render-before.cpp`

4,000 complete native render strips compare byte-for-byte against the pre-change source;
undefined-behaviour sanitization passes. The reference already includes the earlier residue
optimizations. The helper accepts any saved compatible reference `render.cpp`, compiles both
versions with the same host compiler, and compares every output byte, including strip padding.

Scenes vary tube height 4–80, bitmap/sprite fonts, shadows, integer/fractional positive and
negative parallax, zero tilt, ticks/digits above and behind liquid, tick dimensions and
embossing, zero/nonzero contrast, transparency, lenses, fixed/free liquid, both orientations,
residue, wet bands, bubbles, and fizz. Host ESP random values are fixed for repeatability.
These are host image comparisons, not a hardware pixel-equivalence claim.

`python3 firmware/tools/check_residue.py` additionally checks the shared integer/float
blend helpers and residue loop against scalar RGB888 interpolation across 286,326,784
cases, with all RGB565 colours, all fractional alphas, and alpha saturation. UBSan passes.

Firmware builds successfully for the ESP32-S3 and the application flash is verified.

## Board measurements

Baseline includes the previous residue optimization. Same olive-oil settings as that run:
H=60, traceFilm=0.17, traceAmount=2, edgeSoft=4, markContrast=0. Clock paused, freeLiquid=0,
fizz=0, inputGain=0 except the tilted scene (inputGain=1, live IMU). Clear traces
while each clock position settles, then re-enable them. Five FPS samples per case, 2.15 s
apart; report medians. The tilted case uses live IMU readings, so small pose/noise differences
remain possible.

| Stationary scene | FPS before → after | Render ms before → after | FPS gain |
| --- | --- | --- | --- |
| Nearly empty, film across glass (`11:59:59`) | 36.9 → 37.8 | 19.56 → 18.92 | 2.4% |
| Half-filled (`06:30:00`) | 27.3 → 32.2 | 29.02 → 23.41 | 17.9% |
| Nearly full (`00:00:01`) | 23.9 → 31.1 | 34.11 → 24.53 | 30.1% |

The first patch (tick/digit shortcuts and skipping zero-contrast luminance) saved
0.62–0.97 ms in these stationary scenes. The shared packed blend then saved another
0.02 / 4.75 / 8.61 ms respectively. The largest gain is in scenes with many marks behind liquid.

A live-IMU half-filled run measured 25.1 → 25.5 FPS (32.15 → 31.46 ms), but pose was not
controlled and the final samples varied from 24.8 to 25.6 FPS. Treat it as an observation,
not a repeatable moving-scene improvement. The stationary gains are not a blanket FPS claim.

All benchmark parameter changes were restored and the complete parameter readback matched
the latest pre-benchmark snapshot, including the user's new inputGain=0. The clock resumed.
The known Windows bridge close timeout occurred only after restoration was verified.

Final build used `PLATFORMIO_BUILD_DIR=/tmp/watches-render-perf/pio-build` to avoid collisions
with a concurrent user build. Application flashing completed and esptool verified the image.
