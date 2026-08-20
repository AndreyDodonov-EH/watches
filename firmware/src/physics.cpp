#include "physics.h"
#include <math.h>

static inline float clampf(float v, float lo, float hi) { return v < lo ? lo : v > hi ? hi : v; }
static inline float dz(float v, float d) { return fabsf(v) < d ? 0 : v - (v > 0 ? d : -d); }

void stepTube(TubeState &s, const TiltInput &in, const Params &p, float dt) {
  const float along = dz(in.along, p.deadzone);
  const float across = dz(in.across, p.deadzone);

  const float fillRest = clampf(along * p.fillSloshGain, -FILL_SLOSH_MAX_PX, FILL_SLOSH_MAX_PX);
  const float fillAcc = -p.fillK * (s.fillPos - fillRest) - p.fillDamp * s.fillVel + in.gyroAcross * p.angleGyroGain * 4;
  s.fillVel += fillAcc * dt;
  s.fillPos += s.fillVel * dt;
  if (s.fillPos > FILL_SLOSH_MAX_PX) { s.fillPos = FILL_SLOSH_MAX_PX; s.fillVel = fminf(0, s.fillVel); }
  if (s.fillPos < -FILL_SLOSH_MAX_PX) { s.fillPos = -FILL_SLOSH_MAX_PX; s.fillVel = fmaxf(0, s.fillVel); }

  const float aMax = fminf(p.angleMax, ANGLE_HARD_MAX_DEG);
  const float angleRest = clampf(along * p.angleTiltGain, -aMax, aMax);
  const float angleAcc = -p.angleK * (s.angle - angleRest) - p.angleDamp * s.angleVel + in.gyroAcross * p.angleGyroGain * 10;
  s.angleVel += angleAcc * dt;
  s.angle += s.angleVel * dt;
  if (s.angle > aMax) { s.angle = aMax; s.angleVel = fminf(0, s.angleVel); }
  if (s.angle < -aMax) { s.angle = -aMax; s.angleVel = fmaxf(0, s.angleVel); }

  const float target = across * p.acrossShiftGain;
  s.acrossShift += (target - s.acrossShift) * fminf(1, 8 * dt);
  s.edgeLight += (clampf(along, -1, 1) - s.edgeLight) * fminf(1, 5 * dt);
}

float GravityNorm::update(float n) {
  if (!init) { mag = n > 0.5f ? n : 1; init = true; }
  else mag += (n - mag) * 0.01f;
  return fmaxf(0.5f, mag);
}

TiltInput ImuFilter::step(const TiltInput &raw, const Params &p, float dt) {
  const float inAlong = clampf(raw.along, -1.2f, 1.2f), inAcross = clampf(raw.across, -1.2f, 1.2f);
  if (!init) { lpAlong = lpAlong2 = inAlong; lpAcross = lpAcross2 = inAcross; hpPrevIn = raw.gyroAcross; init = true; }
  const float a = 1 - expf(-2 * (float)M_PI * p.accelLpHz * dt);
  lpAlong += (inAlong - lpAlong) * a;
  lpAcross += (inAcross - lpAcross) * a;
  lpAlong2 += (lpAlong - lpAlong2) * a;
  lpAcross2 += (lpAcross - lpAcross2) * a;
  float g;
  if (p.gyroHpHz <= 0) g = raw.gyroAcross;
  else {
    const float rc = 1 / (2 * (float)M_PI * p.gyroHpHz), k = rc / (rc + dt);
    g = k * (hpPrevOut + raw.gyroAcross - hpPrevIn);
    hpPrevIn = raw.gyroAcross; hpPrevOut = g;
  }
  g = dz(g, p.gyroDeadzone);
  g = clampf(g, -p.gyroMax, p.gyroMax);
  return { lpAlong2 * p.inputGain, lpAcross2 * p.inputGain, raw.gyroAlong, g * p.inputGain };
}
