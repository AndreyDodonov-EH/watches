# Liquid Watch — Parts Sourcing (prototype cuff)

Date: 2026-08-20. **Board already in hand: non-touch SKU 28872, no headers — do not order.** Orientation per `hardware-handoff.md`: tubes run along the forearm, so the 57.5 mm board lies **across** the band → cuff must be **≥ 65 mm wide** (board 57.5 + ≥3.5 mm leather each side). Sections 2/B below were first written for a 50 mm cuff; the ≥65 mm picks are in the Verified section.

Prices approximate, incl. VAT where known. AliExpress item pages can't be scraped, so AliExpress entries give the item ID / exact search phrase instead of verified price.

## 0. Board facts (verified from Waveshare dimension drawing)

Source drawing: `https://docs.waveshare.com/assets/images/ESP32-S3-AMOLED-1.91-ProductSize-b5bb67c1fbdb6ea1335dbf9d2d76d0b9.webp`
Product photo: `https://www.waveshare.com/media/catalog/product/cache/1/image/560x560/9df78eab33525d08d6e5fb8d27136e95/e/s/esp32-s3-amoled-1.91-1.jpg`

| Item | Value |
|---|---|
| PCB outline | **57.5 × 24.5 mm**, corners R1.0 (NOT 56 × 26 — update the spec) |
| Thickness | 4.0 mm board+display (no headers); 14.1 mm with pin headers fitted → buy the version **without** soldered headers or desolder them |
| Active area | 44.22 × 19.80 mm (±0.1), 536 × 240 px → ~12.1 px/mm |
| AA offset from top edge | 2.35 mm; glass lip 2.35 mm each side |
| Mounting holes | 4×, 38.0 mm apart (long axis), ~17.8 mm apart (short axis), M2 |
| USB-C | bottom short edge, centred; buttons (BOOT/RESET) flank it |
| Battery | onboard 3.7 V **MX1.25 (Molex PicoBlade 1.25 mm) 2-pin** header + charger. Waveshare docs do not print the polarity; check the silkscreen (+/−) next to the header / the schematic PDF before plugging in |
| Price | USD 26–36 (waveshare.com), ~€30 on AliExpress Waveshare store |

Two tube slots of 44 × 6 mm with a 4 mm gap = 16 mm tall → fits inside the 19.8 mm AA with ~1.9 mm margin top/bottom.

---

## Status (2026-08-20)

**Ordered 2026-08-20 — acrylhaus.com, €30.96:** Halbrundstab Ø6 (100639-001), Halbrundstab Ø10 (100639-002), Rundstab Ø8 (100635-002), Rohr Ø8/5 (100629-042), 1 m each. Bar height in `spec/layout.h` / `layout.ts` will be set after comparing 6 / 8 (split Ø8) / 10 mm on the bench. Still wanted: 8 mm half-round — out of stock at architekturbedarf.de (€7.58) and modellbau-profi; re-check in a week.

Decisions so far:
- **Board:** owned (non-touch SKU 28872, no headers).
- **Tools:** assumed available at the hardware colleague's bench — Basket C is reference only.
- **Leather:** does **not** have to be one wide piece. The cuff can be laminated from several narrow strips (e.g. 2–3 × 25–35 mm, or a 50 mm centre strip plus 10–15 mm edge strips) glued/stitched edge-to-edge on a thin lining — that brings the cheap, in-stock 5 cm pre-dyed strips back into play and lets the strip seams double as the slot edges. So width is not a blocker; don't pre-select.
- **Tubes/rods:** sampler ordered (above); rod = bar width, firmware layout follows the chosen rod. Height budget: 2·margin + 2·bar + bridge = 19.8 mm; keep bridge ≥ 3 mm leather → bar ≤ 7 mm at 1 mm margins (6 mm → 12/72/72/72/12 px).

### Measure-first checklist (with the firmware calibration face, serial cmd `c`)
1. Bar height in mm (spec says 72 px = 6.0 mm; verify with calipers against the glass) → rod width = bar height + 1–2 mm (a lens slightly wider than the bar hides the bar's edges under the curve). 6 mm bar → 7–8 mm rod; if the bars end up 5 mm → 6 mm rod; 7–8 mm → 10 mm rod.
2. Gap between bars (spec 4.0 mm) → decides whether two separate rods fit side-by-side (need gap ≥ ~1.5 mm after the rods' flats) or whether one wider rod / a bezel bar is needed.
3. Distance from bar edges to the glass edge and to the board outline → how much leather margin exists beside the slots.
4. Bar length (44.2 mm) → rod cut length = bar length + 2–4 mm.
5. Only then order from the verified optics sources below (acrylhaus has 6 / 10 mm half-round and Ø8 round in stock; 8 × 4 is out of stock everywhere in DE at the moment).

## ✅ Verified sources (checked live 2026-08-20, EU/DE shipping) — for when the measurements are in

Every link below was fetched and showed the product with price on 2026-08-20. Amazon.de / eBay.de / Etsy / AliExpress blocked automated checks, so entries from those shops further down are *unverified*.

### Basket A — acrylhaus.com (optics, one order, in stock, 1–3 days DE)

| Qty | Item | URL | Price |
|---|---|---|---|
| 1 | Halbrundstab Acrylglas XT transparent **Ø10 mm** (10 × 5), 1000 mm | https://acrylhaus.com/Halbrundstab-Acrylglas-XT-transparent-R-10mm-1000mm | €9.87 |
| 1 | Halbrundstab Acrylglas XT transparent **Ø6 mm** (6 × 3), 1000 mm | https://acrylhaus.com/Halbrundstab-Acrylglas-XT-transparent-O-6mm-1000mm | €7.03 |
| 1 | Rundstab Acrylglas XT transparent **Ø8 mm**, 1000 mm | https://acrylhaus.com/Rundstab-Acrylglas-XT-transparent-O-8mm-1000mm | €8.10 |
| 1 | Acrylglasrohr XT Ø8/5 mm (1.5 mm wall), 1000 mm | https://acrylhaus.com/Acrylglasrohr-rund-XT-transparent-O-8-5mm-Aussen-Innen-1000mm | €5.96 |

acrylhaus does **not** carry 8 × 4 half-round. The exact 8 × 4 profile is currently **out of stock** at both modellbau-profi.de (€11.60) and architekturbedarf.de (€7.58, https://www.architekturbedarf.de/kunststoffe/halbrundstaebe/acrylglas-xt-halbrundstab-_-80-mm — watch this one). UK fallback: Plastock 8 mm half-round £6.61 ex VAT / 2 m, min order £25, import customs. For the prototype the Ø10 and Ø6 half-rounds bracket the target; the Ø8 round rod can be sanded flat to 8 × ~5.

Alt Ø8 round rod with free cut-to-length: dabenmo.de PLEXIGLAS Rundstab Ø8 €8.73 — https://www.dabenmo.de/PLEXIGLAS-Acrylglas-Rundstab-farblos-klar/SW10011.46

### Basket B — leather, 5 cm strips (fine if the cuff is laminated from several strips)

| Qty | Item | URL | Price |
|---|---|---|---|
| 1 | **lederriemen.com "Classic" Blankleder 5 cm, 2.9–3.4 mm, ~120 cm, dunkelbraun/cognac** (in stock) | https://lederriemen.com/Lederriemen-Blankleder-Classic-rotbraun-5cm-breit | €17.70 |
| alt | lederriemen.com Blankleder natur, configurator 5 cm / 3.0–3.5 mm / 120 cm | https://lederriemen.com/Lederriemen-Blankleder-natur | from €5.50 |
| alt | lederundhund.de Blankleder Riemen 50 mm, ~3 mm, 1.2 m, braun | https://www.lederundhund.de/p/blankleder-lederriemen-farbig-10mm-50mm-breit-1-2m-lang-ca-3mm-dick | €6.30 |
| alt | leder-hobby.de Blankleder Riemen, 44/50 mm, 3.0–3.5 mm, cut to order | https://www.leder-hobby.de/Blankleder-Riemen | from €3.69 |

No verified EU source for a **brown 50 mm ready-made snap cuff** — make it from the strip. (axymore.de has a 5.7 cm black one at €13.99: https://axymore.de/lederarmband-breit-in-schwarz-mit-druckknopfer.html ; leatherpunk.com US 2" brown $32.90.)

### Basket B2 — leather ≥ 65 mm, single-piece option (verified 2026-08-20)

| Qty | Item | URL | Price |
|---|---|---|---|
| 1 | **lederriemen.com Blankleder natur — 7 cm × 3.0–3.5 mm × 120 cm** (direct variant link), natural veg-tan, Made in Germany, in stock, next-day DE | https://lederriemen.com/index.php?a=1802 (configurator: https://lederriemen.com/Lederriemen-Blankleder-natur ) | €21.50 |
| alt | same, **8 cm × 3.0–3.5 mm × 120 cm**, in stock | https://lederriemen.com/index.php?a=1865 | €24.30 |
| alt | **ledermacher.de Premium Blankleder Zuschnitt 21 × 30 cm, 3.0–3.5 mm**, natural, in stock — one sheet = a 70 × 220 mm cuff + offcuts; add a 1.3–1.5 mm sheet (€11.45) for a lining/pocket layer | https://www.ledermacher.de/premium-blankleder-zuschnitt-21x30-cm | €11.45 |
| alt | schuhbedarf.de Punzierleder Stück 20 × 30 cm, 3.0–3.5 mm (same shop as snaps + glue → one parcel) | https://schuhbedarf.de/leder/punzierleder/punzierleder-stuecke-20-x-30-cm-blankleder-dickleder-3-0-3-5-mm.html | €14.99 |
| alt | leder-hobby.de Blankleder Riemen, widths to 150 mm (70/80 mm available), 2.8–3.2 or 3.0–3.5 mm, cut to order — price only in configurator | https://www.leder-hobby.de/Blankleder-Riemen | from €3.69 |
| alt | marketender.de Blankleder 3.0–3.5 mm cut-to-size, **pre-dyed braun** available, €104/m² (≈€6 for 20 × 30) | https://www.marketender.de/Material-Werkzeug/Leder/Blankleder-3-0-3-5mm-im-Zuschnitt.html | ~€6–10 |

Widths 6–10 cm at lederriemen.com come only in 120 cm (fine: 4–5 cuffs per strip). lederriemen "Classic" pre-dyed only goes to 5 cm, so wide = natural/undyed → dye with Fiebing's or leave natural.

**Ready-made wide snap cuffs:** nothing plain at 65–80 mm in stock in the EU. Closest: leatherpunk.com (US) "Plain Brown 2 3/8" wristband" = **60 mm**, $34.90 (https://www.leatherpunk.com/products/brown238-plain); eBay.de 322142246641 "Lederarmband 60 mm Braun Druckknopf" €26.95 (unverified). 60 mm means the board ends sit ~1 mm inside the edge — too tight. Make the cuff from the strip/sheet.

Cheapest one-parcel route: **schuhbedarf.de** — 20 × 30 cm 3 mm sheet €14.99 + snap kit €3.99 + Kövulfix €9.99 = €29, free shipping > €30 (add a second sheet or a hole punch).

### Basket C — tools & glue (reference only; colleague has equipment)

| Qty | Item | URL | Price |
|---|---|---|---|
| 1 | Druckknopf 15 mm + Werkzeug, 10 pcs (silver; antique brass available) | https://schuhbedarf.de/metallwaren/druckknoepfe/druckknopf-15mm-mit-kugelkopf-verschluss-werkzeug-montageanleitung-silber.html | €3.99 |
| 1 | Kövulfix Rekord 90 g contact cement | https://schuhbedarf.de/klebstoffe/klebstoff-tuben/koevulfix-rekord-schuhkleber-90g-profi-kontaktkleber-fuer-leder-reparaturen.html | €9.99 |
| 1 | **Langlocheisen 10 × 6 mm** (Paffrath, DIN 7200, Made in Germany) | https://www.werkzeughandel-roeder.de/langlocheisen-10-x-6-mm | €36.25 |
| alt | wupptool Langlocheisen 10 × 6 mm | https://www.wupptool.de/produkt/formlocheisen-kappenlocheisen-langlocheisen-10x6-mm | €40.22 |
| pro | Osborne Line 24 setter €32.20 + Line 24 snaps 10 pcs €5.70 (leather up to 3.5 mm) | https://www.rickert-werkzeug.de/Osborne-Druckknopf-Einsetzwerkzeug/OSB-229-20M | €37.90 |

A 6 mm slot punch is €36+ — for a one-off, drill/punch Ø6 holes at both slot ends and cut between with a knife + steel ruler instead (€0).

### Basket D — battery (board already owned: non-touch SKU 28872, no headers)

| Qty | Item | URL | Price |
|---|---|---|---|
| 1×2 | **batteryzone.de 502035 500 mAh MX1.25, 37 × 20 × 5 mm, 2 pcs, "positive"(standard) polarity** — DE shop but 10–18 business days (drop-shipped); protection PCB **not stated → ask seller** | https://batteryzone.de/products/2x3-7-v-500-mah-mx1-25-positiver-stecker-502035-digitale-hochtemperatur-polymer-lithium-batterie-fur-intelligente-gerate | €9.00 |
| alt | same cell, **reversed** MX1.25 polarity variant (if the board turns out reversed) | https://batteryzone.de/products/2x3-7-v-500-mah-mx1-25-umgekehrter-stecker-502035-digitaler-hochtemperatur-polymer-lithium-akku-fur-intelligente-gerate | €9.00 |
| alt | eckstein-shop.de LP503035 500 mAh **JST-PH 2.0**, with PCM, 5 mm thick — back-order to 31.08.2026; needs re-termination to a PicoBlade 1.25 pigtail | https://eckstein-shop.de/LiPo-Battery-Lithium-Ion-Polymer-Battery-37V-500mAh-with-JST-PHR-2-Connector-LP503035-EN | €5.19 |
| ✗ | The Pi Hut PKCELL PicoBlade — **ships to England/Wales only**, drop it | — | — |

**Polarity, now confirmed from the schematic** (https://files.waveshare.com/wiki/ESP32-S3-AMOLED-1.91/ESP32-S3-AMOLED-1.91.pdf): charger is a **PL4054**; BAT1 symbol pin 1 = BAT (+, also goes to PL4054 pin 3 and the 10k/1k divider → BAT_ADC on GPIO1), pin 2 = GND. The physical socket orientation is not drawn, so before plugging in: meter continuity from each socket pin to USB shell/GND — the pin **not** shorted to GND is +. Match to the battery's red wire; swap crimps if needed. Dimensions zip: https://files.waveshare.com/wiki/ESP32-S3-AMOLED-1.91/Esp32-s3-amoled-1_91-M.zip

### Verified-basket total (one cuff)

| | |
|---|---|
| Optics (acrylhaus, 4 items) | €31 |
| Leather, 7 cm strip (lederriemen natur) or 21×30 sheet (ledermacher) | €12–22 |
| Snaps + glue (schuhbedarf) | €14 |
| Slot punch (optional) | €36 |
| Battery ×2 (batteryzone) | €9 |
| **Total** | **≈ €66–76 without punch / €102–112 with**, plus shipping (~€15 across 3–4 shops) |

---

## 1. Clear "vial" optics over the slots

Best effect ranking: **half-round solid rod (1)** > full round rod, cut (2) > thin-wall tube, cut (3) > real spirit-level vial (4, but it hides the screen).

A solid half-round rod is a plano-convex cylinder lens: the flat face sits on the leather/slot, the curved face magnifies the 6 mm-tall tube graphic ~1.3–1.5× and gives the "liquid in glass" look plus light-pipe glow at the ends. A hollow tube only gives edge highlights, not magnification.

| # | Product / spec to search | Where | Price | Image | Why |
|---|---|---|---|---|---|
| 1a | **Acryl Halbrundstab 8 × 4 mm, XT glasklar, 1000 mm** | modellbau-profi.de — https://www.modellbau-profi.de/Werkstoffe-Halbzeug-Profile/Kunststoffe/Acrylglas/Acryl-Halbrundstab/Acryl-Halbrundstab-8mm-x-1000mm-XT-transparent-glasklar.htm?a=article&ProdNr=007572200830&p=12833 | €11.60 /m | https://www.modellbau-profi.de/modellprofi/prodpic/Acryl-Halbrundstab-8mm-x-1000mm-XT-transparent-glasklar-007572200830_b_0.JPG | Exactly the target profile; 1 m = 20 vials. **Out of stock 2026-08-20** |
| 1b | Half-round acrylic rod 6 mm / 8 mm, clear, 2000 mm | Plastock UK — https://www.plastock.co.uk/products/acrylic-extruded-clear-half-round-rod | £3.27 (6 mm) / £6.61 (8 mm) ex VAT | https://www.plastock.co.uk/cdn/shop/products/clear_acrylic_-_half_round.png | Cheapest; also 10 mm if a fatter lens is wanted |
| 1c | Halbrundstab Acrylglas XT transparent, cut to length | acrylhaus.com — https://acrylhaus.com/Halbrundstab-aus-Acrylglas-XT-transparent ; architekturbedarf.de — https://www.architekturbedarf.de/kunststoffe/halbrundstaebe/1 | ~€5–12 | — | EU shops with Zuschnitt (cut-to-size) |
| 1d | AliExpress search: `acrylic half round rod clear 8mm` / `semicircle acrylic strip transparent 8mm` | https://www.aliexpress.com/w/wholesale-acrylic-half-round-rod.html | ~€3–6 per 0.5–1 m | — | Slow shipping; sizes are sometimes 8 mm *height* not width—read listing |
| 2a | **Full round rod Ø8 mm clear PMMA**, 500–1000 mm (sand one side flat, or split on a table saw/with a jig) | acrylhaus — https://acrylhaus.com/Rundstab-aus-Acrylglas-XT-transparent-O-8mm-Zuschnitt ; AliExpress `acrylic rod 8mm clear 500mm` | €3–6 | — | Ubiquitous; gives the strongest lens if you leave it nearly full round (bulges 6+ mm above leather) |
| 2b | Full round rod Ø6 mm (flush look) | same sellers; Amazon.de `Acrylglas Rundstab 6mm klar` | €3–5 | — | Lower profile, ~1.2× magnification |
| 3a | Clear acrylic tube **8 mm OD / 6 mm ID**, 500 mm (uxcell) | Amazon — https://amazon.com/uxcell-Rigid-Acrylic-Round-Tubing/dp/B095HN6LZR (same SKU on amazon.de: search `uxcell Acrylrohr 8mm 6mm 500mm`) | €7–10 /2 pcs | — | Half-tube over slot = glassy highlight, minimal distortion; wall 1 mm is brittle when split |
| 3b | AliExpress item 1005006109977031 / 4000656266870 — `acrylic pipe transparent 8mm OD 6mm ID 300mm` | https://www.aliexpress.com/w/wholesale-clear-acrylic-pipe.html | €1–3 | — | Cheapest tube source |
| 3c | Glass: borosilicate test tube Ø8 × 75 mm or capillary/NMR tube 5 mm | Amazon.de `Reagenzglas 8mm Borosilikat` ; AliExpress `glass tube 8mm OD 1mm wall` | €5–8 /10 pcs | — | Most "real glass" look; splitting glass lengthwise needs a diamond disc—better to use whole tube in a trench |
| 4 | Ready spirit-level vials: acrylic block vial (e.g. 6 × 15 mm, 50 pcs ebay.de 165886739003; 50 mm green tube vials at caterpillar-red.com / spiritlevelvial.com) | https://www.ebay.de/itm/165886739003 ; https://caterpillar-red.com/by-colour-vial-levels/ | €5–15 | — | Opaque liquid hides the AMOLED — only useful as a look reference or as decorative *end caps*, not over the screen |

Recommendation: 1a/1b (8 × 4 mm half-round, cut to 46–48 mm, flame- or sand-polish ends). Buy 2a Ø8 as a fallback/alternate look.

---

## 2. Leather for the cuff

Target (updated): veg-tan, **65–80 mm wide** (board across the band), 2.8–3.5 mm (7–9 oz), natural or dark brown. Wrist ~170 mm + snap overlap 25 mm → 200–220 mm per cuff. The 45–50 mm entries below predate the orientation decision.

| # | Product / spec | Where | Price | Why |
|---|---|---|---|---|
| A1 | **Veg-tan belt blank 50 mm (2") × 3.2–3.6 mm (8–9 oz), 120–130 cm** (Krumenauer / ELW) | Amazon — https://www.amazon.com/Krumenauer-Vegetable-Leather-Inches-3-2-3-6/dp/B07T93SMK4 ; amazon.de search `Blankleder Riemen 50mm 3mm vegetabil` | €12–20 | One strip = 5+ cuffs; stiff enough to hold the board flat |
| A2 | Veg-tan "Blankleder Streifen" 40–50 mm, 2.5–3 mm, natural | amazon.de / etsy.com/market/veg_tan_leather_3mm ; EU shops: lederhaus.de, leder-koehler.de, rickert-werkzeug.de (search `Blankleder Streifen 50 mm 3 mm`) | €8–15 /m | Slightly thinner = easier to punch slots |
| A3 | AliExpress `vegetable tanned leather strip 50mm 3mm` / `cowhide belt blank strap 5cm` | https://www.aliexpress.com/w/wholesale-veg-tan-leather-strip.html | €5–10 /m | Variable quality; fine for prototype |
| B1 | **Blank leather cuff bracelet, 50 mm wide, 2 snaps** (camel/dark brown) | AliExpress `wide leather cuff bracelet blank 5cm snap` — https://www.aliexpress.com/w/wholesale-leather-cuff-bracelet-with-snaps.html ; Etsy https://www.etsy.com/market/leather_snap_cuff ; Rings & Things https://rings-things.com/jewelry-findings-and-components/rings-and-bracelets/leather-bracelets/ | €3–10 each | Skip strap cutting & snaps; just punch slots and glue a second layer/pocket for the board |
| B2 | Two-layer approach: 50 mm cuff blank + 1–1.5 mm thin lining leather/suede (AliExpress `thin leather sheet 1mm`) | — | €3–5 | Board sandwiched between outer (slots) and inner (pocket) layers |

---

## 3. Leather tools (minimum set)

| Tool | Spec to search | Where / price | Note |
|---|---|---|---|
| Strap cutter | "Draw gauge strap cutter wood" or just a steel ruler + **Olfa/Stanley utility knife** | AliExpress/Amazon.de €8–15 / €5 | Knife + ruler is enough for one cuff |
| Slot (oblong) punch | **Oblong hole punch 6 mm** (actually ~6 × 30–38 mm) — search `oblong punch leather 6mm` / `Langlocheisen 6 mm`; or **flat chisel punch 6 mm** (`leather flat chisel punch 6mm`, Etsy https://www.etsy.com/market/6mm_leather_hole_punch) | AliExpress €3–8, Amazon.de €8–15 | A 44 mm slot = several overlapping punches or chisel + knife. Alternative: drill 6 mm holes at each end, join with knife |
| Edge beveler | "Edge beveler #2 (~1.0–1.3 mm)" e.g. TLKKUE set | Amazon — https://www.amazon.com/TLKKUE-Trimming-Sandalwood-Sharpener-Different/dp/B0989SLGPV, AliExpress €4–12 | Rounds cuff & slot edges |
| Snaps + setter | "Line 24 snap fasteners 15 mm antique brass + setting tool" (`Druckknöpfe 15mm Set Werkzeug`) | AliExpress/Amazon.de €6–12 kit (50–100 snaps + dies + hole punch) | Or 10 mm "Line 20" for thinner look |
| Rivets | Double-cap rivets 8 mm + setter (often in same kit) | €5–8 | To hold lining layer |
| Contact cement | Kövulfix / Renia Colle de Cologne / generic "Kontaktkleber Leder" (`contact cement leather`) | Amazon.de €6–9 | Also bonds acrylic to leather; for acrylic-on-acrylic use cyanoacrylate or E6000/B-7000 |
| Mallet + cutting board | Poly mallet / rubber mallet, kitchen PE board | €5–10 | Don't hammer punches with steel |
| All-in-one | "Leather craft tool kit 18–30 pcs" (AliExpress/Amazon.de) | €20–35 | Usually includes beveler, punches, mallet, snap setter, groover |

---

## 4. Battery — 3.7 V LiPo, MX1.25 / PicoBlade 2-pin, ≤5 mm thick

Board space behind PCB ≈ 57 × 24 mm; keep cell ≤ 50 × 22 mm. Candidates (cell size code = T×W×L in 0.1 mm):

| # | Product | Where | Price | Image | Note |
|---|---|---|---|---|---|
| 1 | **PKCELL 500 mAh 3.7 V LiPo, PicoBlade 1.25 mm (Molex 51021), 35 × 30 × 5 mm** | The Pi Hut — https://thepihut.com/products/500mah-3-7v-lipo-battery-1-25mm-picoblade-connector | £6 | https://thepihut.com/cdn/shop/files/500mah-3-7v-lipo-battery-1-25mm-picoblade-connector-pkcell-106602-1211901934.jpg | **Does NOT ship outside England/Wales (lithium rule, checked 2026-08-20)**; 30 mm wide is wider than the 24.5 mm board → protrudes 3 mm each side under the leather (acceptable) or pick #2 |
| 2 | **502035 / 502040 MX1.25 500 mAh** (5.0 × 20 × 35/40 mm) — AliExpress item 1005004361874420 (802035 MX1.25 5 pcs) or search `502040 MX1.25 battery 3.7V` | https://www.aliexpress.com/w/wholesale-mx1.25-battery.html ; batteryint.com 502035 MX1.25 https://batteryint.com/products/2x3-7-v-500-mah-mx1-25-positive-connector-502035-digital-high-temperature-polymer-lithium-battery-for-smart-devices | €3–6 each | — | 20 mm wide fits under the board; 5 mm thick |
| 3 | **402535 / 402540 ~350–400 mAh, 4 mm thick**, JST 1.25 2-pin | AliExpress `402540 3.7V 1.25mm plug`; Amazon.de `3.7V 400mAh 402540 1.25mm` | €4–8 | — | Thinnest option; ~8–10 h at 40 mA avg AMOLED draw |
| 4 | 503035 500 mAh with "JST 1.25 2-pin" (eBay 296066814451 / 185788773141; KBT on Amazon B0BJPPJ49D ships with PH1.25 + PH2.0 leads) | https://www.ebay.com/itm/296066814451 ; https://www.amazon.com/KBT-3-7V-500mAh-Li-Polymer-Battery/dp/B0BJPPJ49D | €6–12 | — | 5 × 30 × 35 mm |

**Polarity caveat (important):** "JST 1.25 / MX1.25 / PicoBlade" batteries have no standard pin order. Waveshare boards *mostly* put + on the pin nearest the board edge/"+" silkscreen, but it varies by board and by battery vendor (Pi Hut explicitly warns this). Before connecting: (a) look at the "+"/"−" silkscreen next to the MX1.25 header on the back of the board (and/or the schematic in the wiki Resources section), (b) meter the battery's red wire, (c) if reversed, lift the crimp tabs with a pin and swap the wires. Reversing will kill the charger IC. Also: buy a cell **with protection PCB** (most of these have one) and never solder directly to the cell.

---

## 5. Light control (optional)

| Item | Spec | Where | Price |
|---|---|---|---|
| Black self-adhesive flock paper | "Self adhesive black velvet flocking paper/sheet A4" (AliExpress/Amazon.de `selbstklebend Samt Flock Folie schwarz`) | €3–6 /A4 | Line slot walls → no leather-coloured light bleed, sharper tube edges |
| Black EVA foam tape 1 mm | "Single-sided black EVA foam tape 1 mm × 10 mm" | AliExpress/Amazon.de €2–4 | Gasket between board glass and leather; blocks side leak, cushions |
| Diffuser film | LCD diffuser sheet / "PET frosted diffuser film 0.3 mm" or simply frosted Scotch tape | €2–5 | Put **under** the acrylic, only if the per-pixel look shows through the lens; usually unnecessary with AMOLED |
| Black matte paint for rod ends | Edding 750 black paint marker | €3 | Mask rod ends if you don't want the light-pipe glow at the ends |

---

## 6. Other parts / ideas

- **Bezel/carrier (recommended):** a 3D-printed (PETG/TPU) or laser-cut 3 mm black acrylic frame, 57.5 × 24.5 mm pocket + two 44 × 6 mm windows with 8 mm half-round grooves, gap bar 4 mm. It registers the board, the rods and the slots to each other (hand-punched leather will be ±0.5 mm). Print services: JLC3DP / Craftcloud; laser: any local FabLab. Cost €3–10. Leather is then glued over the frame with the slots cut slightly oversize (6.5 mm) so the frame defines the edge.
- **M2 × 4 mm screws + nuts** (board mounting holes, 38.0 × 17.8 mm pattern) — AliExpress M2 assortment €3.
- **Short angled USB-C cable** or leave a USB-C cutout at the bottom edge for charging/flashing (connector is centred on the bottom short edge).
- **Slide switch** (MSK-12C02, 3 mm) in the battery lead if the board doesn't expose a power switch — €2/10 pcs.
- **Thin double-sided tape (3M 9448 / VHB 0.5 mm)** to fix the rods' flat face onto the leather without glue squeeze-out — €3.
- Micro-files + 400/800/1500 grit wet paper + plastic polish (Novus 2 / toothpaste) for rod ends — €5.

---

## Suggested minimum shopping list (one cuff + spares)

| Qty | Item | ~Cost |
|---|---|---|
| 1 m | Acrylic half-round 8 × 4 mm clear (modellbau-profi / Plastock) | €7–12 |
| 0.5 m | Acrylic round rod Ø8 clear (fallback look) | €3 |
| 1 | Veg-tan strip 50 mm × 3 mm × 1.2 m, or 2 × blank 50 mm snap cuffs | €10–15 |
| 1 | 15 mm snap kit with setter (+ hole punch) | €8 |
| 1 | 6 mm oblong/flat punch + rubber mallet | €10 |
| 1 | Utility knife + steel ruler + edge beveler | €10 |
| 1 | Contact cement (leather) + 3M double-sided tape | €8 |
| 1–2 | LiPo 500 mAh MX1.25, 5 × 20 × 35–40 mm (502035/502040) | €6 |
| 1 | Black flock sheet A4 + 1 mm black foam tape | €6 |
| 1 | 3D-printed/laser-cut bezel (optional) | €5 |
| | **Total** | **≈ €75–85** (≈ €45 if you already own basic tools) |

## Open questions for the user

1. ~~Board~~ — owned (non-touch 28872, no headers).
2. Cuff construction: one ≥65 mm piece vs laminated narrow strips (leaning strips). Wrist circumference still needed.
3. Rod profile: decide **after** measuring the bars on the real display (see checklist at top).
4. Should the rods' ends glow (light-pipe) or be masked black?
5. Battery: PKCELL/Pi Hut is out (UK-only shipping). batteryzone.de 502035 (20 mm wide, 10–18 days, PCM unconfirmed) vs eckstein JST-PH 503035 with PCM + re-terminate?
6. Is a 3D-printed bezel acceptable (visible as a thin black frame in the slots) or must it be pure leather + acrylic?
7. Is the slot gap (4 mm) leather or part of the bezel? If leather, 4 mm of 3 mm-thick leather between two 44 mm slots is fragile — consider 5 mm or bezel.
8. Region for purchasing (EU vs Russia/CIS) — affects whether Amazon.de/Plastock or AliExpress/Ozon links should be primary.
