// Liquid Watch — single source of truth for panel layout.
// Mirrored in spec/layout.ts (Phase 2). Landscape 536x240, origin top-left.
#pragma once

#define PANEL_W            536
#define PANEL_H            240

#define TUBE_LENGTH_PX     536   // full width; leather may mask the outer ~10px
// Defaults; runtime values come from params tubeHeight / hoursY / minutesY.
#define TUBE_HEIGHT_PX     72    // ≈ 6 mm at ~0.083 mm/px
#define TUBE_HEIGHT_MAX    120   // strip buffer size
#define HOURS_TUBE_Y       0     // tube spans y 0..72
#define MINUTES_TUBE_Y     168   // tube spans y 168..240
#define BRIDGE_Y0          72    // bridge zone y 72..168 must stay pure black
#define BRIDGE_Y1          168

// Colors (RGB888 reference; RGB565 derived, verify on AMOLED)
#define LIQUID_RGB888      0x5DCAA5
#define LIQUID_HI_RGB888   0x9FE1CB
#define BG_RGB888          0x000000

#define RGB565(r,g,b)      ((uint16_t)((((r) & 0xF8) << 8) | (((g) & 0xFC) << 3) | ((b) >> 3)))
#define LIQUID_RGB565      RGB565(0x5D,0xCA,0xA5)   // 0x5E54
#define LIQUID_HI_RGB565   RGB565(0x9F,0xE1,0xCB)

// ---- IMU axis mapping (QMI8658, measured 2026-08-20 with USB_LEFT=1 orientation) ----
// Board flat, screen up:  a ≈ (+0.03, -0.07, +0.94) g   (|a| ≈ 0.94 → accel scale ~6 % low, normalize)
// Lift USB-C (left) end:  ay → negative   → IMU Y is ALONG the tube; liquid flows toward the RIGHT.
// Lift far/top long edge: ax → negative   → IMU X is ACROSS the tube (toward viewer positive).
// Z points out of the screen.
#define IMU_AXIS_ALONG_TUBE   1      // 0=x 1=y 2=z
#define IMU_ALONG_TUBE_SIGN  -1      // tilt_along = IMU_ALONG_TUBE_SIGN * ay  → positive = right end down
#define IMU_AXIS_ACROSS_TUBE  0
#define IMU_ACROSS_TUBE_SIGN -1      // positive = far edge down
