// Port of sim/src/physics.ts — fixed-step 50 Hz liquid dynamics + IMU conditioning.
#pragma once
#include "gen/params_gen.h"

#define PHYS_HZ 50
#define PHYS_DT (1.0f / PHYS_HZ)
#define FILL_SLOSH_MAX_PX 30.0f   // structural caps — params only tighten, never widen
#define ANGLE_HARD_MAX_DEG 20.0f
#define ACROSS_MAX_PX 40.0f
#define GYRO_LP_HZ 12.0f          // smooths both gyro outputs (sensor noise twitches fizz/agitation)

struct TiltInput { float along, across, gyroAlong, gyroAcross; };

struct TubeState {
  float fillTarget = 0, fillPos = 0, fillVel = 0, angle = 0, angleVel = 0, acrossShift = 0, acrossVel = 0, agitation = 0, edgeLight = 0, acrossTilt = 0;
};

void stepTube(TubeState &s, const TiltInput &in, const Params &p, float dt = PHYS_DT);

// Slow EMA of |a| used as the gravity divisor (sensor reads ~0.94 g; never divide by instantaneous |a|).
struct GravityNorm {
  float mag = 1; bool init = false;
  void reset() { init = false; }
  float update(float n);
};

// accel: two cascaded one-pole LPs; gyro: one-pole HP + deadzone + clamp.
struct ImuFilter {
  float lpAlong = 0, lpAcross = 0, lpAlong2 = 0, lpAcross2 = 0, hpPrevIn = 0, hpPrevOut = 0, lpGyroAcross = 0, lpGyroAlong = 0;
  bool init = false;
  void reset() { init = false; hpPrevIn = hpPrevOut = lpGyroAcross = lpGyroAlong = 0; }
  TiltInput step(const TiltInput &raw, const Params &p, float dt = PHYS_DT);
};
