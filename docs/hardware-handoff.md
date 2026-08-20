# Liquid Watch — Hardware / Sourcing Handoff

_Written 2026-08-20 (end of Phase 2 sim session). For a separate chat that handles the physical build: leather cuff,
acrylic "vials", battery, bezel. Firmware/sim status lives in `STATUS.md`; the full sourcing research with links and
prices is `docs/parts-sourcing.md` — this file is the summary + decisions + what's still open._

## 1. What the object is
A wide leather cuff with the Waveshare **ESP32-S3-AMOLED-1.91** set into it. Only two narrow horizontal strips of the
AMOLED are visible through two slots in the leather; a clear acrylic half-round rod sits over each slot so each strip
reads as a glass vial of glowing green liquid (hours on top, minutes below, filling left → right like progress bars).
Concept art: `images/concept-cuff.jpg` (correct orientation), close-up `images/concept-vial-closeup.jpg`,
liquid reference `images/reference-liquid.jpg`.

## 2. Geometry — the numbers that drive the leather/acrylic work

**Orientation (decided):** the tubes run **along the forearm**, i.e. *perpendicular to the band*. The board's long axis
therefore lies across the cuff's width. USB-C end points toward the **hand** ("left" when you look at the watch with
the hand pointing left). The sourcing report was written before this decision and assumes a 50 mm cuff with the board
along the band — **re-check cuff width accordingly** (see open questions).

| Item | Value | Source |
|---|---|---|
| Board outline | **57.5 × 24.5 mm**, R1 corners, 4.0 mm thick w/o headers (14.1 mm with headers — buy/leave unsoldered) | Waveshare dimension drawing |
| Mounting holes | 4 × M2, 38.0 mm (long axis) × ~17.8 mm (short axis) | drawing |
| Active area (AA) | 44.22 × 19.80 mm, 536 × 240 px, **0.083 mm/px** (~12.1 px/mm); AA sits 2.35 mm in from the glass edge | drawing |
| Tube slots (in px → mm) | length 536 px = 44.2 mm; height 72 px = **6.0 mm**; hours tube y 24–96, minutes y 144–216 → slot centres **5.0 mm** and **14.9 mm** from the AA top edge; **gap between slots 48 px = 4.0 mm**; margin above/below 24 px = 2.0 mm | `spec/layout.h` |
| USB-C | centred on one short edge, BOOT/RESET buttons flank it | drawing |
| Battery header | onboard MX1.25 / Molex PicoBlade 2-pin, 3.7 V LiPo, charger on board. **Polarity NOT documented — check silkscreen/schematic (`vendor/waveshare/ESP32-S3-AMOLED-1.91-schematic.pdf`) and meter the cell before plugging in** | wiki + report |
| Calibration face | Firmware boots into it: two solid green rectangles exactly at the slot positions + white centre lines. Use it to mark/cut the leather; it stays available forever (serial cmd `c`). | `firmware/`, `STATUS.md` |

Wrist fit: the user's wrist circumference is not recorded yet; typical 170 mm + 25 mm snap overlap → ~200–220 mm strap.

## 3. Sourcing conclusions (details + links in `docs/parts-sourcing.md`)

**Vial optics — recommendation: solid clear acrylic half-round rod 8 × 4 mm** (plano-convex cylinder lens: ~1.3–1.5×
vertical magnification, glowing light-pipe ends). Cut to 46–48 mm, polish ends. Sources: modellbau-profi.de (€11.60/m),
Plastock UK (£6.61/2 m, also 6 mm), acrylhaus.com (cut-to-size), AliExpress (`acrylic half round rod clear 8mm`).
Fallbacks: Ø8 full round rod (stronger bulge), 8/6 mm thin-wall tube split lengthwise (highlight only, no lens), glass
test tube in a trench. Real spirit-level vials are opaque-filled — reference only, never over the screen.
The sim's top-bar `lens` / `lens curve` sliders approximate this optic; `lens≈0.5` ≈ 8 × 4 mm rod.

**Leather:** veg-tan, 2.8–3.5 mm. Either a belt blank strip (Krumenauer/ELW 50 mm on Amazon, €12–20, enough for 5+ cuffs;
EU shops lederhaus.de / rickert-werkzeug.de: `Blankleder Streifen`) or a pre-made blank snap cuff (AliExpress/Etsy
€3–10) to skip strap cutting — **but** see width question below; 50 mm may now be too narrow.
Two-layer build: outer layer with the slots, inner 1–1.5 mm lining forming the board pocket.

**Tools (minimum):** utility knife + steel ruler, 6 mm oblong/flat punch (`Langlocheisen 6 mm`), edge beveler, Line-24
15 mm snap kit with setter, contact cement (leather), poly mallet, 3M 9448 double-sided tape for the rods. Or a €20–35
all-in-one kit.

**Battery:** 3.7 V LiPo with MX1.25, ≤5 mm thick, ≤ ~50 × 22 mm to hide under the board: 502035/502040 (5 × 20 × 35/40 mm,
~500 mAh, AliExpress €3–6) is the best fit; PKCELL 500 mAh from The Pi Hut (£6) is the easy EU buy but 30 mm wide.
Protection PCB required. Re-pin the crimp if polarity is reversed.

**Light control:** black flock sheet to line slot walls, 1 mm black EVA foam tape as gasket between glass and leather,
optional black paint on rod ends if the end-glow is unwanted.

**Bezel (recommended):** 3D-printed or laser-cut black frame (57.5 × 24.5 pocket, two 44 × 6 windows, 8 mm half-round
grooves, 4 mm bar) to register board ↔ rods ↔ slots; hand-punched leather is ±0.5 mm and a 4 mm leather bridge between
slots is fragile. Cost €3–10 (JLC3DP / local FabLab).

**Budget:** ≈ €75–85 for one cuff incl. tools, ≈ €45 with tools owned.

## 4. Open questions (decide these first in the new chat)
1. **Cuff width vs. board length.** With the tubes along the forearm the 57.5 mm board lies across the band. Options:
   (a) cuff ≥ 62–65 mm wide (board fully inside the leather); (b) 50 mm cuff with the board's ends under a raised
   "bridge"/saddle; (c) board in a separate leather or printed housing stitched onto a narrower band. Pick one — it
   decides the leather order.
2. Rod profile: 6 mm flush vs **8 × 4 mm** (target) vs Ø8 near-full round. Suggest ordering 8 × 4 and Ø8 and comparing.
3. Rod ends glowing (light-pipe) or masked black?
4. Bezel acceptable (thin black frame visible in the slot) or pure leather + acrylic?
5. Slot gap 4 mm leather (fragile) vs 5 mm vs bezel bar. If the gap changes, update `BRIDGE_Y0/Y1` and tube y in
   `spec/layout.h` / `spec/layout.ts` (single source of truth) — the firmware calibration face follows automatically.
6. Battery: accept 30 mm-wide PKCELL (EU, fast) or wait for 20 mm-wide 502040 (AliExpress)?
7. Purchase region (EU/Amazon.de/Plastock vs AliExpress/Ozon) — decides which links are primary.
8. Wrist circumference; snap vs. buckle closure; leather colour (brown per concept art, black tile also exists).
9. Touch vs non-touch board — we have the **non-touch SKU 28872** (no headers).

## 5. Suggested next steps for the hardware chat
1. Answer Q1 (width strategy) → finalise slot drawing (mm) from the table above; export a 1:1 PDF cutting template
   (536 × 240 px AA box, two 44.2 × 6 mm slots at 5.0 / 14.9 mm from the AA top, board outline, mounting holes).
2. Place the order from the shopping list in `docs/parts-sourcing.md` §"Suggested minimum shopping list".
3. Optional: model the bezel (OpenSCAD/FreeCAD) — parameters: board 57.5 × 24.5 × 4.0, AA offset 2.35, slot dims above,
   rod groove r = 4 mm.
4. When parts arrive: flash is already on the board (calibration face at boot) — align, mark, punch, fit rods, then
   compare the real vial optic against the sim's `lens` setting and adjust the sim, not the hardware.
