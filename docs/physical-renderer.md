# Physical renderer: first optical milestone

The alternative renderer is available in the simulator at **`physical.html`**, linked from the
legacy simulator. Both entries build together. Start the simulator with `cd sim && npm run dev`.
Use Chrome/Edge on Windows and select COM6 through Web Serial; WSL USB forwarding is unnecessary.

Choose **olive oil**, select a time mode, connect, then **push physical**. Push commits the physical
properties, selects the renderer, and sends the selected/real/demo clock. **Send selected time**
sends the current time mode without changing material properties. **Return legacy device** selects
the existing renderer. The raw panel view is what firmware draws. The acrylic-rod view adds an
approximate geometric preview of the real 6 mm half-round rods; it is not sent to the display.
The **background** and **digits** selectors are simulator display palettes; they affect the lab view
and remain separate from the physical material schema and device transaction.

Physical settings have separate JSON and browser storage. Firmware physical settings and renderer
selection are volatile; boot selects legacy and retains the existing legacy NVS settings. Legacy
v17 files are deliberately rejected by the physical importer. Only controls with implemented effects
are exposed. The oil absorption coefficients are visual estimates at 20 °C, not measured oil data.

## Implemented model

- Orthographic cross-section of a circular hollow tube: air → wall → oil/air → wall → air → backing.
- Snell refraction, unpolarized dielectric Fresnel and total internal reflection, with at most four
  interfaces per primary ray. Only the front reflected branch samples the environment. Internal
  reflected branches are omitted, so their energy is lost rather than reassigned to transmission.
- Beer–Lambert RGB absorption in inverse millimetres along the actual liquid path. Changing radius
  changes both optical depth and refraction. There is no independent bulk opacity control.
- A Gaussian angular light and ambient illumination. Backing illumination uses a bounded 2D
  projected-area approximation; this is not a full environment integral or spectral transport.
- Flat unlit tick/3×5 numeral masks on the backing, refracted by the same rays as the backing.
  Tick bands use the projected vertical window of the curved wall, so they remain visible through oil.
  The shallow artwork compensates through its shape for cylindrical magnification, without altering
  the ray mapping. Oil and air magnify the same artwork differently.
- Linear RGB transport and fractional-fill blending, followed by assumed sRGB output and RGB565
  quantization. Panel response has not been measured.
- An independent geometry-only PMMA rod preview: nominal index 1.49, fixed 3 mm radius, flat face
  touching the panel, face-on viewer. Room reflections, cover layers and imperfect contact are not
  calibrated. Rod centres follow tube centres; the virtual tube radius is a separate property.

This is a **static optical slice**, with time-driven planar fill boundaries. It has no end meniscus,
film/residue, viscosity, slosh, tilt response, scattering, emission, or dynamic contact angles yet.
Those remain sequenced in [the implementation plan](physical-renderer-plan.md). The next visual
checkpoint is evaluating the oil and water views through the actual acrylic rods, before adding film.

The legacy simulator now also draws a thin glass rim over the top and bottom silhouette rows, so its
rectangular liquid spans read as rounded tubes while retaining the existing renderer controls.

## Code boundaries

`spec/physical-schema.json` defines units, ranges and defaults. Run
`python3 firmware/tools/gen_physical.py` after changing it; `--check` detects stale generated files.
The schema generates `sim/src/physical/model.ts` and `firmware/src/physical/model.h`.

The simulator's `physical/` directory separates optical equations, geometry, lighting, marks,
output encoding, cached rendering, hardware preview, device protocol, persistence and UI.
The C++ `firmware/src/physical/` modules mirror the optical equations and output path. Main firmware
only dispatches the chosen renderer, manages transactions, and reuses clock/display/dual-core work.

Wet/dry RGB565 layers rebuild on property generation changes. Ordinary frames copy spans into the
existing DMA strips and blend at most one fractional boundary pixel per row. The hours/minutes
contexts and caches are disjoint, preserving the existing core ownership and idle-worker handshake.
Rendering never advances physics. The lab view is independently rendered with the same equations.

## Memory ledger

All firmware physical caches allocate once at boot at maximum supported size. No resize, lazy
allocation or alternate-heap fallback occurs during rendering, commits or mode switches. Failure is
reported at boot and `R physical` is rejected. Geometry validation covers the outer diameter,
80-row capacity, panel bounds and non-overlapping tube strips.

| Allocation | Maximum bytes | Region / lifetime |
|---|---:|---|
| Physical wet/dry layers, 2 tubes × 2 media × 536 × 80 × 2 | 343,040 | PSRAM, once at boot |
| Physical pointer, initialization state and two generation contexts | 24 | Internal static, including alignment |
| Physical committed/staged params and dispatch controls | 140 | Internal static, including alignment |
| Frame-interval histogram and counters | 524 | Internal static, including alignment |
| Existing shared DMA strips, 2 × 536 × 80 × 2 | 171,520 | Internal DMA RAM, once at boot |
| Existing full-screen canvas | 257,280 | PSRAM, once at boot |
| Existing legacy glyph pools | 36,864 | PSRAM, once at boot |
| Existing legacy renderer contexts / traces / LUTs | 25,560 / 2,144 / 2,048 | Internal static |
| Existing rendering-worker stack | 4,096 plus TCB | Internal RAM, once at boot |

Explicit application PSRAM storage totals **637,184 bytes**, excluding allocator bookkeeping. The
combined firmware reports **72,008 bytes of static RAM**. The new internal storage is about 688 bytes.
The 2,146-byte hex dump scratch is shared with the legacy dump, adding no second buffer.
`s` reports `physical-bytes 343056` for layers plus generation contexts; this diagnostic is not the
whole-application memory total. The existing BLE/driver stacks retain their own fixed boot costs.

## Device protocol

The existing serial and BLE line transports carry these commands:

| Command | Behavior |
|---|---|
| `V` | Physical version, schema digest and selected renderer |
| `R physical` / `R legacy` | Select renderer and liquid clock face |
| `Pbegin` | Copy committed physical settings to the staging candidate |
| `P name=value` | Validate and stage one finite, in-range field |
| `Pcommit` | Validate combined geometry and atomically publish the candidate |
| `Pcancel` | Discard the candidate |
| `P?` | Read committed physical settings |
| `X` | Dump physical strip layout, fills and unswapped RGB565 rows; ends with `END` |
| `f` | Existing FPS/render figures plus `frame-p95` in milliseconds |

Failed commits leave the active configuration unchanged. The lab verifies the schema digest before
allowing writes, snapshots pushes, serializes complete operations and cancels failed transactions.
The existing `T` and `d` commands set the clock and its speed. Physical pushes do not write legacy
properties or NVS. The frame histogram includes the interval between frame starts (serial, IMU and
render/display work), rounds up to milliseconds and saturates at 255 ms; dumps perturb that metric.

## Reproducible verification

```sh
cd sim
npm run build
npm run check:physical
npm run check:imu
npm run check:presets
# with a Vite server running (the configured default is 5190):
PHYSICAL_LAB_URL=http://127.0.0.1:5190/physical.html node tools/check-physical-ui.cjs
```

Physical checks cover Fresnel/TIR/matched indices, Beer–Lambert thickness behavior, central ray path,
finite/bounded transmission, invalid schema/layout cases, cache invalidation, native storage canaries
and eleven whole-frame comparisons between TypeScript and native C++ (≤1 RGB565 channel LSB).

```sh
python3 firmware/tools/compare-physical-device.py --port COM6 --scene oil --out firmware/.compare/physical-oil
python3 firmware/tools/compare-physical-device.py --port COM6 --scene water --out firmware/.compare/physical-water
python3 firmware/tools/compare-physical-device.py --port COM6 --scene maximum --out firmware/.compare/physical-maximum
```

`--scene` explicitly selects and configures a fixed scene. Omit it for a read-only capture of an
already-selected physical renderer. Some COM bridge open/close sequences reset the board, reverting
volatile physical settings; selecting the test scene in the same connection handles that case.
Artifacts contain the device/reference/difference PNGs and exact frame inputs.

## Device results — 2026-09-18

Tested on the connected ESP32-S3 through Windows COM6, application-only flash, preserving NVS.
Both renderers were measured on the same new firmware, fixed 10:09:30, IMU influence disabled,
BLE advertising with no client attached. FPS/render values are medians of three separate two-second
windows; p95 is the largest reported window value.

| Scene | FPS | Concurrent render/display section | Whole-frame p95 |
|---|---:|---:|---:|
| Legacy oil, 72 rows | 35.2 | 20.23 ms | 30 ms |
| Physical oil, 72 rows | 76.1 | 5.43 ms | 14 ms |
| Legacy oil, 80 rows | 34.5 | 20.43 ms | 30 ms |
| Physical oil, 80 rows | 69.6 | 6.22 ms | 16 ms |
| Physical oil, 80 rows, demo ×120 | 69.8 | 6.20 ms | 15 ms |

The steady optical slice meets the initial frame-time gate. This is not feature-equivalent: legacy
still computes its existing film, typography and motion pipeline. Physical film and motion need new
measurements, including a connected BLE client. Rapid light edits were exercised without reset or
heap growth; complete serial begin/edit/commit/status round trips were 432–439 ms through the
Python Windows bridge, including transport overhead.

Free heap remained 19,456 bytes; worker stack high-water free space was 2,380 bytes. The original
legacy properties, including IMU gain, were restored afterward. Device/reference captures for oil,
water and maximum-height tubes were pixel-identical in RGB565. Protocol checks passed for staging
isolation, cancellation, invalid/nonfinite numbers, unknown fields, fractional layout, wall-inclusive
panel bounds, overlap rejection, atomic failed commits and numeric endpoints. Browser checks cover
failed commit cancellation, incompatible firmware, operation locking, clock snapshots, selected/demo
transmission and invalid inputs without page errors.

The default and `/watches/` production builds pass. Host optical/frame checks and the existing IMU and
preset suites pass. Appearance through the physical rods and BLE-connected endurance testing remain
review/next-phase checks, not claims established by these tests.
