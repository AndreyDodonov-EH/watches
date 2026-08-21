// Port of sim/src/render.ts. Draws the two tube strips into a 536x240 RGB565 framebuffer whose
// pixels are stored BYTE-SWAPPED (panel is big-endian; see PsramCanvas in main.cpp).
#pragma once
#include <stdint.h>
#include "gen/params_gen.h"
#include "physics.h"

// Fizz animation state (sim: stepFizz), call at PHYS_HZ.
void stepFizz(const Params &p, float dt, float along = 0, float across = 0, float agitation = 0);
// Draw one tube (0 = hours, 1 = minutes) into `strip`: TUBE_HEIGHT_PX x PANEL_W RGB565, byte-swapped,
// representing panel rows HOURS_TUBE_Y.. / MINUTES_TUBE_Y.. . Everything else on the panel stays as is.
void renderTube(int idx, const TubeState &s, const Params &p, uint16_t *strip);
