// Port of sim/src/render.ts. Draws the two tube strips into a 536x240 RGB565 framebuffer whose
// pixels are stored BYTE-SWAPPED (panel is big-endian; see PsramCanvas in main.cpp).
#pragma once
#include <stdint.h>
#include "gen/params_gen.h"
#include "physics.h"

// Fizz animation state (sim: stepFizz), call at PHYS_HZ.
void stepFizz(const Params &p, float dt, float along = 0, float across = 0, float agitation = 0);
// Tube geometry from params, clamped to the panel and the strip buffer (sim: tubeLayout).
struct TubeLayout { int H, yH, yM; bool operator!=(const TubeLayout &o) const { return H != o.H || yH != o.yH || yM != o.yM; } };
TubeLayout tubeLayout(const Params &p);
// Draw one tube (0 = hours, 1 = minutes) into `strip`: H x PANEL_W RGB565, byte-swapped,
// representing panel rows yH.. / yM.. . Everything else on the panel stays as is.
// Allocates the fixed render pools (once, at boot). False = PSRAM allocation failed.
bool render_init();
// gen: params generation counter (bumped by main on every param write / preset load / NVS restore);
// all param-only tables inside the renderer are keyed on it.
void renderTube(int idx, const TubeState &s, const Params &p, uint32_t gen, uint16_t *strip);
