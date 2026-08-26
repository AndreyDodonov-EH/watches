Good pivot — e-ink inverts almost every property of the AMOLED design, so the concepts should invert too.

What changes

Loses: smooth motion. Partial refresh ~300 ms with ghosting, full refresh 1–2 s with a black/white flash. The IMU-driven liquid wobble is dead.
Gains: bistable (holds image at zero power), reflective (better in sun than indoors), matte paper look, months of battery, and — the interesting one — flexible panels and custom-shaped segmented panels.

Concepts that exploit that

Ticker-tape cuff. Flexible panel (E Ink Mobius class, or Waveshare flexible 2.13"/4.2") wrapped around the leather so the time is a strip you read by rotating your wrist. Timeline rather than dial: the current hour is a marker moving along the strip, one partial refresh per minute. Longitudinal use of the cuff fits your form factor better than the tubes did.
Last-seen watch. Lean into bistability: display only updates when you raise/tap. Otherwise it shows the time you last checked plus "47 min ago" in small type. Memory of your attention rather than the present. Zero-power by design — this is the concept that's impossible on any other display tech.
Hourly print. Colour e-paper (Spectra 6 / E6, ~12–20 s full refresh) is useless for a live clock but ideal for one full-face image per hour — a woodcut/risograph-style plate that changes 24×/day. The slow, flashing refresh becomes an hourly "chime" you notice from the corner of your eye.
Segmented custom shapes. E-ink and electrochromic segment displays can be ordered in arbitrary silhouettes — Sony's FES watch did whole-body e-paper. This lets you keep the two-tube geometry: the tube outlines are physical segments that darken in discrete steps. Ynvisible's printed electrochromic is worth a look here specifically: flexible, cheap, ~1 s transitions that look like ink bleeding into paper — arguably closer to "liquid" than a pixel sim ever was.
Refresh-as-mechanism. Style the face as a split-flap or flip-clock and let the partial-refresh flicker be the flap transition. Turns the main defect into the animation.
Prose face. Typographic: "quarter past four, Tuesday" in a handwritten or letterpress font, updated every 5 min. Reads like a page from a notebook set in leather. Cheap to prototype, and the 5-min granularity is a feature.
Shadow dial. Since the panel is reflective, add a raised gnomon and print only hour marks; outdoors the real shadow tells time, indoors a drawn shadow fills in from ambient-light + RTC. Half sundial, half display.

E-ink changes the design space quite a lot. Instead of trying to imitate a normal smartwatch, I would exploit its strongest property: the display can look like a physical printed/mechanical object rather than a screen.

For the wristwatch concept we discussed, these directions seem especially interesting:

Concept	What the face looks like	Why e-ink fits
1. Two pseudo-fluid tubes	Keep the original two horizontal tubes, but render “liquid” digitally, with bubbles/meniscus/marks	Preserves the original identity without actual hydraulics
2. Mechanical ruler	Two long scales slide past fixed windows: 1 2 3 … 12 and 00 05 … 55	Looks more like an instrument than a smartwatch
3. Split-flap / airport board	Huge hour and minute cards, visually resembling physical flip panels	Refresh only once/minute, perfect for e-ink
4. Ink blot clock	Every minute a new irregular ink shape grows; hour/minute are encoded by its geometry	Makes refresh imperfections part of the design
5. Geological strata	Horizontal layers accumulate through the day. Current hour/minute indicated by boundaries in the strata	E-ink naturally looks like printed paper / sediment
6. Blueprint instrument	Fine technical drawing: rulers, crosshairs, dimensions, calibration marks, tiny annotations	High-resolution monochrome e-ink is excellent for line art
7. Circular “mechanical aperture”	No hands. Concentric rings expose numbers through cutout-like windows	Can visually mimic a mechanical watch without animation
8. Binary/industrial panel	Rows of large black/white blocks, status lamps, register-style labels	Could fit your industrial/embedded aesthetic particularly well
9. Calendar tear-off watch	Face resembles a tiny printed card: giant 15:47, weekday/date underneath; layout changes every day	E-ink looks genuinely like printed paper
10. Architectural watch	Time represented as a façade: windows illuminate/fill according to hour/minute	Every minute becomes a new static illustration
11. Shadow clock	A fake sundial shadow moves around an illustrated object	Static updates mean it can look surprisingly physical
12. “Impossible mechanical” watch	Render gears, Geneva wheels, cams and counters that could never physically fit in the case	Use e-ink to make a fake mechanical complication
13. Typewriter watch	A strip of paper with stamped/typewritten time; each minute appears as if freshly typed	Ghosting can actually strengthen the aesthetic
14. Topographic clock	Contour lines form around hour/minute values; landscape slowly morphs during the day	Makes the whole screen decorative rather than UI-like
15. Barcode / punch-card watch	Time encoded graphically, with tiny human-readable digits as secondary information	Very distinctive and easy to make ultra-minimal

A few I think could become genuinely distinctive rather than merely “a smartwatch with an unusual watch face”:

A. Moving paper inside glass

Make the case resemble a tiny mechanical measuring instrument.

There are two narrow e-ink strips/windows rather than one obvious rectangular display:

╭────────────────────────────╮
│        H O U R             │
│   10   11  [12]  1   2     │
│ ────────────────────────── │
│       M I N U T E          │
│   40   45  [50] 55   00    │
╰────────────────────────────╯

The numbers appear printed on endless paper/ribbon running under two physical windows. The central engraved line is the indicator.

This would be a nice spiritual successor to the two glass tubes concept: still two linear channels, but now they are information tapes rather than liquid.

B. E-ink “Nixie” watch

Not literally imitate glowing Nixies. Instead make two physical cavities in the case with e-ink at the bottom:

╭─────────╮  ╭─────────╮
│         │  │         │
│    15   │  │    47   │
│         │  │         │
╰─────────╯  ╰─────────╯

Put thick glass over them, perhaps slightly magnifying. Render extremely crisp serif/technical numerals.

It could look like an electromechanical counter from the 1960s, especially with bronze/brass/stainless steel around it.

C. Infinite mechanical complication

Have a round e-ink panel, but don't render a conventional dial. Show something like:

        ╭────────╮
    ╭───┤   15   ├───╮
  ⚙ │   ╰────────╯   │ ⚙
    │  42       47   │
    ╰──────○─────────╯

Every minute, the entire mechanism jumps into another mechanically plausible configuration.

The important trick is that nothing needs to animate. It simply goes:

mechanism state 15:46 → blink/update → mechanism state 15:47

That discrete jump actually feels like machinery.

D. A watch that accumulates time

Instead of displaying time as coordinates, treat the day as a physical quantity.

For example, the screen starts almost white at midnight and progressively fills with black “ink”:

00:00  ░░░░░░░░░░░░░░░░░░░░

06:00  █████░░░░░░░░░░░░░░░

12:00  ██████████░░░░░░░░░░

18:00  ███████████████░░░░░░

23:59  ████████████████████

Then encode minutes as texture, vertical position, scratches, dots, etc.

It makes time feel like a consumed resource, which is more conceptual than normal watch UI.

E. Real physical mask + e-ink

Probably my favorite direction.

Don't let the user perceive the e-ink rectangle at all. Put a metal dial/mask above a larger e-ink panel containing several oddly shaped holes:

┌─────────────────────────────┐
│         ╭──────╮            │
│         │  3   │            │
│  ───────╯      ╰─────────   │
│                             │
│   ╭─────────────────────╮   │
│   │  15  20  25  30  35 │   │
│   ╰─────────────────────╯   │
│               ◉             │
└─────────────────────────────┘

Because only selected regions are visible, the device stops looking like an electronic screen. The e-ink becomes almost a programmable material behind a mechanical face.

You could combine that with actual:

engraved brass/stainless faceplate;
sapphire or mineral glass;
physical screws;
one crown;
leather cuff like the original design;
intentionally deep display recesses;
curved magnifying lenses over individual windows.

And there is another especially strange possibility: don't make the e-ink display rectangular at all visually. A normal rectangular panel hidden behind a mask could expose, say:

two horizontal tubes;
one circular porthole;
four tiny indicator windows;
a curved scale;
one large irregular “ink reservoir.”

That gives you much more freedom than selecting an exotic custom-shaped e-ink panel.

For your original design lineage, I would develop these three further:

1. Two Time Ribbons — closest descendant of the hydraulic watch.
2. Impossible Mechanical Instrument — strongest standalone object/design statement.
3. E-ink Behind a Machined Metal Mask — probably the most convincing way to make something that doesn't look like a smartwatch at all.

Can you generate concept art for 4,6,7,12(with depth) and for driection D