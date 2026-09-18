# Alternative physical renderer — staged plan

Status: phases 0–1 implemented and device-verified, 2026-09-18. Review the static optical slice through
the actual rods before starting phase 2. The existing renderer and committed olive-oil look remain
available. See [implementation, limitations and measurements](physical-renderer.md).

## Confirmed direction

1. Build for **both simulator and firmware**, preserving efficient frame rates. Device feasibility is
   part of the first optical milestone, not a later porting exercise.
2. Start with **olive oil** and extend the set of implemented, tweakable physical properties gradually.
3. Use **physically motivated models in service of appearance**. Realism contributes to looking good;
   attractive stylization is allowed, including slightly glowing liquids in later presets.
4. Hardware has **two half-round acrylic rods, 6 mm wide / 3 mm high**, with the flat faces directly
   on the display. Use radius 3 mm and zero intentional air gap for the hardware preview.

Clear water is a verification case, not a second full preset project. Approximation choices and any
artistic departures are recorded explicitly; neither needs to be disguised as measured physics.

## Intended result

A separate **Physical lab** simulator page where material, vessel, lighting, and clock behavior are
distinct. Changing a material property changes the corresponding physics and appearance, rather than
indirectly setting highlight widths, glow strengths, opacity boosts, or spring constants.

The first milestone is a stationary oil column on both targets with convincing glass and transmitted
backing/marks. Next comes a controllable oil film, then a moving slug that deposits and drains it.
Each visible milestone includes device timing. We review those results before expanding the material list.

The current olive-oil preset is a visual reference, not a set of measured physical coefficients.
There is no exact automatic conversion from the old parameters to a physical material.

## Repository boundaries

- `sim/src/render.ts` and `firmware/src/render.cpp` remain the existing renderer. Avoid a wholesale
  refactor as a prerequisite for the experiment.
- Reuse `spec/layout.ts` / `.h`: 536×240 output, 536-pixel tube length, maximum 80-pixel strip height,
  approximately 0.083 mm/pixel, and RGB565 encoding.
- Reuse time selection, input acquisition, and font assets where practical. Extract only the small
  utilities actually needed by both pages; protect the existing page with baseline renders.
- Current `TubeState` contains artistic state (`light`, `cap`, normalized `trace`, etc.). It can feed
  a temporary geometry adapter for controlled comparisons, but is not the physical simulation schema.
- The physical material schema, presets, imports, and local-storage key are separate from `Params` v17.
  Define one physical schema with units/ranges and generate TS/C++ definitions plus UI metadata.
  Extend serial/BLE with explicit renderer capabilities/selection and a physical-property namespace;
  the current transport accepts only legacy `Params`. An old device must show physical mode as
  unsupported, rather than accept a misleading partial conversion. Keep old exports and NVS intact.
- Existing sprite sheets contain baked lighting. Start with flat tick/glyph masks as scene surfaces;
  offer old shaded sprites later as explicitly baked artwork.

## Model and controls

| Group | User-facing properties | Derived behavior |
|---|---|---|
| Liquid | refractive index; absorption RGB in 1/mm, with a transmitted-colour swatch at a stated thickness | reflection/refraction and depth-dependent colour |
| Fluid | density in kg/m³; dynamic viscosity in mPa·s; surface tension in mN/m | inertia, drag, capillary response, film deposition/drainage |
| Liquid–wall pair | advancing/receding contact angles in degrees | wetting, contact-line pinning and release; these belong to the material pair |
| Vessel | inner radius and wall thickness in mm; glass/acrylic refractive index; surface roughness | optical interfaces, liquid volume and physical length scale |
| Lighting / backing | area-light direction, size and intensity; environment fill; backing reflectance | highlights and visible transmitted colour |
| Watch | time mode, tilt, reading/play behavior, scale and label layout | deliberate watch behavior, separate from the material |

All coefficients are evaluated at a declared reference temperature. A temperature slider is deferred
until temperature-dependent data exists. Each preset records source/temperature or clearly labels a
value as estimated. Only controls with implemented effects appear in the UI.

Later materials may add scattering and **emission**. Emission is a separate material contribution
with an explicit intensity/colour, zero for ordinary olive oil; it is not achieved by breaking Fresnel
or absorption. Artist-chosen values are welcome. Scene lighting and display exposure are also available
for art direction. Any eventual bloom is labelled a display/camera effect, separate from emission.

### Appearance

- Perform transport/compositing in linear RGB; encode to display colour and quantize to RGB565 at
  output. Establish an explicit display assumption until the panel response is measured.
- Use Beer–Lambert absorption along the actual liquid path: `T_rgb = exp(-sigmaA_rgb * distance_mm)`.
  Transmission depends on depth; there is no independent bulk-transparency slider. See
  [PBRT: Transmittance](https://pbr-book.org/4ed/Volume_Scattering/Transmittance).
- Derive reflected/transmitted contributions from refractive indices, surface normals and Fresnel;
  use Snell refraction, including total internal reflection. See
  [PBRT: Dielectric BSDF](https://pbr-book.org/4ed/Reflection_Models/Dielectric_BSDF).
- Model an explicit circular tube cross-section, wall, liquid/air interfaces, and backing/mark planes.
  The cylinder body admits reusable cross-section tables; menisci need their own local geometry.
- Start with a face-on orthographic camera and an explicitly supported tilt range. Keep camera pose,
  gravity and illumination distinct; the current two-axis gravity input is not a complete camera or
  lighting measurement. Broader viewing angles require their own geometry and performance checks.
- Begin with a fixed light/environment and bounded analytic ray paths for reference/table construction.
  The device hot path uses bounded table lookups, interpolation and compositing. State omitted paths
  and approximation error, especially internal reflections. No unbounded recursion or sampling loops.
- A non-emissive absorbing liquid needs light arriving through/from the scene to show colour. A black
  backing may correctly make it very dark; use an intentional lighting setup instead of adding glow.
- Rear marks are sampled along refracted paths and attenuated by the same medium as the backing.
  Front marks are placed on the relevant vessel surface. No mark-specific fake transparency.

### Oil film and motion

- Store film **thickness**, not stain opacity. Render it as the actual glass/oil/air stack so the
  zero-thickness limit returns to bare glass. Oil-film visibility comes from changed interfaces,
  thickness/shape variation, and absorption. A uniformly thin film can legitimately be subtle.
- Start with manually specified film patches to validate optics independently of fluid motion.
- Then add a reduced slug model: gravity/inertia, viscosity-derived resistance, capillary forces and
  contact-angle hysteresis. Check the relevant Reynolds, Bond and capillary-number ranges before
  selecting approximations. Small-capillary assumptions must not silently cover every tube size.
- Meniscus geometry starts from contact angle and capillary pressure, with a bounded reduced shape
  model for motion. Surface-tension and wetting references:
  [MIT interfacial-phenomena notes](https://ocw.mit.edu/courses/18-357-interfacial-phenomena-fall-2010/pages/lecture-notes/).
- Deposition and drainage transfer liquid between the bulk and the wall film. Use a fixed axial grid
  with a small fixed number of circumferential bands so across-tilt can move film toward the low wall.
  Pick resolution after a convergence check; keep units, maximum thickness and memory cost explicit.
- A candidate deposition closure can depend on `Ca = viscosity * speed / surfaceTension`, but its
  validity must be checked against the moving-slug geometry. Do not reuse the old arbitrary rule that
  faster motion always makes a thinner deposit. This relationship is a model decision in phase 3.
- First oil model has no evaporation or separate dry pigment. Drainage/reabsorption accounts for its
  changing film; adding ink or a volatile liquid later requires separate solvent and deposit state.
- Conserve bulk-plus-film volume for a fixed time. Clock progression changes target volume through an
  explicit source/sink; reading mode applies an explicit controller. Both are watch design choices,
  and are excluded from free-fluid conservation/energy checks.

## Real acrylic versus rendered glass

`docs/hardware-handoff.md` describes a real acrylic rod over the display. That is a separate optical
system from a fictional liquid-filled vessel rendered on the panel.

Use the confirmed **3 mm-radius half-round** profile, flat face directly on the display. This radius
describes the real rod; the virtual vessel's inner radius and wall thickness are separate scene geometry.
Keep raw panel output and the virtual-vessel view separate from the hardware preview. Disable the
existing CSS gloss and artistic lens remap in physical mode. Treat rod-to-panel spacing as an explicit
calibration value initialized to zero intentional gap; account for the display cover stack only if
calibration needs it. Early device reviews must use the actual rods, because a convincing
browser image can still be distorted by the hardware. Any pre-compensation belongs to display
calibration, not the liquid material.

## Proposed code structure

Keep modules purpose-specific; no renderer framework is needed before the second implementation works.

```text
spec/physical-schema.json         physical settings, units, bounds and defaults; TS/C++ generation input
sim/physical.html                 separate entry, built alongside index.html
sim/src/physical/
  main.ts                        lab orchestration and input/time adapters
  model.ts                       versioned material, vessel, scene and state types; units/limits
  materials.ts                   physical presets and provenance
  geometry.ts                    cylinder, interfaces, menisci, ray intersections
  optics.ts                      linear colour, absorption, Fresnel/refraction, bounded transport
  lighting.ts                    environment/area-light sampling
  motion.ts                      reduced slug/contact-line dynamics
  film.ts                        bounded thickness field, deposition and conservative drainage
  marks.ts                       label/tick masks located on scene surfaces
  render.ts                      frame/strip orchestration and fixed scratch/LUT ownership
  output.ts                      display encoding and RGB565 output
  ui.ts                          property groups, units, preset and scene controls
  persistence.ts                 independent physical-scene JSON and browser session
firmware/src/physical/
  geometry.*                     bounded tables and surface geometry
  optics.*                       same optical equations and table semantics as TS
  motion.*                       fixed-step reduced dynamics
  film.*                         fixed-capacity film state and updates
  render.*                       per-tube contexts, RGB565 strip rendering, boot initialization
```

Rendering consumes a read-only scene/state snapshot and writes caller-owned output; it never advances
physics. Time and motion advance at a fixed step. Rebuild caches by explicit geometry/material/light
dependencies. Keep per-tube mutable buffers independent for the existing dual-core firmware rendering.
Reuse the current display/DMA API and strip ownership.

The lab has a material inspector, scene/light controls, selected time/demo, and repeatable tilt clips.
Useful diagnostics are liquid path length, transmission, interface reflection, film thickness and
volume error, frame time and memory use. Diagnostics stay outside the normal material controls. Compare with saved legacy images
under named scenes; identical pixels are not an acceptance requirement for the new model.

## Build sequence and checkpoints

| Phase | Deliverable | Verification / decision |
|---|---|---|
| 0. Baseline and contract | Preserve legacy reference images and current oil device timings; define units, supported ranges, physical JSON and TS/C++ schema; add lab entry and renderer/capability dispatch | Legacy page, exports and firmware mode remain functional; both pages build under the Pages base path; memory ledger covers coexistence |
| 1. Static optical slice, TS + C++ | Wall, liquid, backing and flat marks; physical controls and device push; geometry/optical tables; RGB565 output | Absorption versus thickness, matched indices, reflection/transmission bounds; review oil and clear-water stills through actual rods; benchmark both strips at maximum supported size |
| 2. Oil-film slice, TS + C++ | Prescribed thickness patches through the same optical model | Zero film equals bare glass; thickness changes tint appropriately; moving light reveals film without an opacity boost; check device parity and frame-time budget |
| 3. Reduced dynamics, TS + C++ | Slug motion, contact-angle response, deposition and drainage | Fixed-volume conservation, stable bounded steps, viscosity ordering and fixed-input determinism; review tilt/reversal/settling clips; moving-scene performance with BLE connected |
| 4. Complete alternative | Two clock tubes, selected/demo/real time, reading/play behavior, readable marks, presets/import/export, device selection and diagnostics | No legacy state/schema contamination; rollover/fill extremes, both fill directions, renderer switching and long runs; allocation audit, physical-mode pixel/state parity |
| 5. Extend materials gradually | Add one implemented property at a time, beginning with whichever visual gap the oil review reveals; explicit emission when introducing glowing presets | Each control has a causal effect and targeted checks; new features meet the same memory/frame-time gate |

Phases 0–1 are the first implementation batch. Its review checks both appearance and actual device
cost before committing to the film/motion model. Every later phase stays synchronized across targets.

## Performance and memory gate

Use a TypeScript CPU reference to validate each equation/table and implement its C++ counterpart in the
same phase. Reference and optimized evaluators share material/geometry semantics. Browser-only heavy
rendering is not the product path. For the uniform cylinder body, precompute geometry/refraction by
cross-section; use wet/dry spans, thickness-dependent absorption lookups and local meniscus work.
Keep light-dependent updates small and separate from geometry rebuilds. Bound the table domain and
verify interpolation error; do not build a combinatorial table over every property.

Current firmware has two 536×80 RGB565 DMA strips: **171,520 bytes total**. BLE competes for internal
RAM. Historical renderer measurements reached roughly 40 fps, with scene-dependent costs. Phase 0
records a current baseline with the same geometry, typography, BLE state and deterministic motion clip.
The proposed acceptance target is **at least 95% of legacy FPS**, with no more than **10% regression
in p95 whole-frame time**; aim to equal or beat legacy. Measure moving light/film and property-edit
rebuilds as well as a resting image. Missing the budget triggers simplification of the new model
before adding more effects. Existing WET/DRY-cache handoff documents
describe proposals and are not evidence that those optimizations are already implemented.

For each phase, list every new buffer/table with maximum dimensions, bytes, owner and memory region.
Include both renderers if both will be selectable on-device. Share only resources whose lifetimes
provably do not overlap. All buffers/caches/tables are static or allocated once at boot; no lazy
allocation, silent dimension reduction, dropped features or fallback to another heap. Exceeding a
supported configuration must produce a visible validation/init error.

Bound solver iterations, ray interactions and film-update substeps as well as memory. Detect invalid
material values and unsupported simulation regimes. Any LUT optimization is checked against the
reference over the declared parameter domain, including clear/dark liquids and thin films.

## Scope held for later

Full 3D fluid simulation, splashes/breakup, foam, dissolved gas and bubbles, spectral interference,
multiple scattering for milk/blood, temperature simulation, measured HDR lighting and general-purpose
path tracing are outside the initial model. Metal needs a different surface model; glowing liquids
can extend the liquid model with emission.
Their absence should be explicit rather than approximated through unrelated liquid controls.

No remaining hardware question blocks the plan. Display-cover optical thickness is a possible later
calibration measurement, not an initial user-input requirement.
