// Liquid Watch — single source of truth for panel layout.
// Mirrored in spec/layout.ts (Phase 2). Landscape 536x240, origin top-left.
#pragma once

#define PANEL_W            536
#define PANEL_H            240

#define TUBE_LENGTH_PX     536   // full width; leather may mask the outer ~10px
#define TUBE_HEIGHT_PX     72    // ≈ 6 mm at ~0.083 mm/px
#define HOURS_TUBE_Y       24    // tube spans y 24..96
#define MINUTES_TUBE_Y     144   // tube spans y 144..216
#define BRIDGE_Y0          96    // bridge zone y 96..144 must stay pure black
#define BRIDGE_Y1          144

// Colors (RGB888 reference; RGB565 derived, verify on AMOLED)
#define LIQUID_RGB888      0x5DCAA5
#define LIQUID_HI_RGB888   0x9FE1CB
#define BG_RGB888          0x000000

#define RGB565(r,g,b)      ((uint16_t)((((r) & 0xF8) << 8) | (((g) & 0xFC) << 3) | ((b) >> 3)))
#define LIQUID_RGB565      RGB565(0x5D,0xCA,0xA5)   // 0x5E54
#define LIQUID_HI_RGB565   RGB565(0x9F,0xE1,0xCB)
