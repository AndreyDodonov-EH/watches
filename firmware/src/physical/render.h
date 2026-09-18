#pragma once
#include <stddef.h>
#include <stdint.h>
#include "geometry.h"
namespace physical {
// Call once at boot. Allocates fixed maximum wet/dry layers in PSRAM, no fallback.
bool init();
size_t memoryBytes();
// Caller owns internal DMA strip. Output RGB565 is byte-swapped for the panel.
void renderTube(int idx,float fill,const Params &p,uint32_t gen,uint16_t *strip);
}
