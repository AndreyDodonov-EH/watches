# Perf note — balancing the two render cores

_Follow-up to [perf-handoff-2-dualcore.md](perf-handoff-2-dualcore.md). Written 2026-09-24; nothing implemented yet._

## Observation
Each frame renders the hours tube on core 0 (the `render0` worker) and the minutes tube on core 1 (`loop()`),
concurrently. The frame is done when **both** are done, so frame render time = the slower core. `f` reports each:

```
fps 28.1  render 27.32 ms  push-wait 0.01 ms  cores h 16.15 / m 27.31 ms  (mode l, renderer legacy, transp 0.22)  frame-p95 36 ms
```

This is the spritz preset on the normal build (BLE + IMU on). Core 0 sits idle ~11 ms of every 27 ms frame.
If the two halves were even (~21.7 ms each), the same work would run at ~46 fps render-bound instead of ~37.

**Caveat:** this is one **unpinned** sample (live IMU, real clock 10:12, fillH 0.85 / fillM 0.21). The split
depends on the scene, so re-measure it pinned before acting on it (see Measure).

## Why the minutes tube is heavier (hypotheses to check)
- **More marks.** The minutes tube has 60 ticks, versus 12 on the hours tube. Spritz labels minutes every 5
  (`digitMinuteStep 5`), so it draws 12 two-digit labels on the minutes tube. Digits are the biggest stage
  (13–17.6 ms per frame on spritz, per `bench.py --stages`), so the tube with more glyphs pays most of it.
- **Core 1 does more than render.** `loop()` also runs serial parsing, the physics catch-up steps, `stepFizz`
  (both tubes), IMU polling and the NVS flush. Only the minutes render is timed in `m`, but cache and ISR
  pressure differ between the cores.
- **The split depends on the scene.** How much of each tube's digit and tick area sits behind liquid depends on
  the fill level. Marks behind liquid take the expensive compositing path (bilinear refraction and
  `throughLiquid`).
- **This has flipped before.** During hand-off 2 (2026-08-27) hours was the critical path (14.7 ms on core 0
  vs 10.6 ms on core 1; core 0 was blamed on BT interrupts / shared cache). The imbalance is not a fixed
  property of either core.

## Measure first
1. Add the `cores h / m` fields to `tools/bench.py` output. It parses only fps / render / push-wait today.
2. Pinned scene, both builds (normal and `tools/e2e.sh --bare`), at several fill levels. Use the clock
   (`t HH:MM:SS`) to sweep fillH/fillM, for example 00:05, 06:30, 11:55. Record h and m per preset (spritz, 1).
3. Run the per-stage bench per core: is the gap mostly digits and ticks, or everything?

## Options (cheapest first)
- **Swap the tubes between cores per frame or per scene.** Give the tube that took longer last frame to the
  faster core. This only helps if the cores differ in speed; it does nothing for an imbalance that comes
  from the content itself.
- **Move a whole stage of the heavier tube to the idle core.** For example, core 0 composites the minutes
  tube's rear-digit layer after finishing hours. Both strips are separate buffers, so the only cross-core
  dependency is the stage order within one strip (body → surface → marks → fizz). Adds one extra handshake
  per frame.
- **Split each tube by rows.** Both cores render rows `[0, H/2)` and `[H/2, H)` of each tube. This balances
  best, but `drawTube` keeps state across the whole tube (edge arrays, label layout, fizz), so it is invasive.
- **Move fizz/physics stepping to core 0** (listed under "Not now" in hand-off 2). This frees core 1 time
  outside the timed `m` window but still inside the frame.

## Constraints
- Parity stays bit-exact (`compare-device.py`, `check:meniscus`). Balancing must not change pixels.
- Static memory only (CLAUDE.md): no per-frame allocation for work queues. Size any job list for the worst
  case.
- The worker must keep blocking every frame (core 0 idle task / task-WDT), stay below the BT controller
  priority, and nothing it reads may be written outside the `renderBoth()` window.

## Related numbers (2026-09-24, spritz, pinned bench)
| Build | fps | render |
|---|---|---|
| normal | 29.4 | 25.7 ms |
| bare (`--bare`: no BLE, no IMU) | 34.9 | 21.4 ms |

Spritz per-stage cost on the bare build: digits 13.0 ms, surface band 6.5 ms, meniscus shape 3.3 ms, fizz 2.1 ms,
minute ticks 2.1 ms.
