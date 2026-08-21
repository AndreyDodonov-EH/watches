#include "physics.h"
#include <math.h>

static inline float clampf(float v, float lo, float hi) { return v < lo ? lo : v > hi ? hi : v; }
static inline float dz(float v, float d) { return fabsf(v) < d ? 0 : v - (v > 0 ? d : -d); }

// Highlight rest angle: world-up in the tube cross-section, halved (specular seen along the
// normal), blended with the fixed style angle by lightPhys. See sim lightRest.
float lightRest(float along, float across, const Params &p) {
  float n = sqrtf(fmaxf(0, 1 - along * along - across * across));
  float phys = atan2f(across, n) * 180 / (float)M_PI / 2;
  return p.lightAngle + (phys - p.lightAngle) * p.lightPhys;
}

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
  const float angleRest = clampf(across * p.angleTiltGain, -aMax, aMax);   // in-plane gravity only (see sim physics.ts)
  const float angleAcc = -p.angleK * (s.angle - angleRest) - p.angleDamp * s.angleVel;
  s.angleVel += angleAcc * dt;
  s.angle += s.angleVel * dt;
  if (s.angle > aMax) { s.angle = aMax; s.angleVel = fminf(0, s.angleVel); }
  if (s.angle < -aMax) { s.angle = -aMax; s.angleVel = fmaxf(0, s.angleVel); }

  const float rest = lightRest(along, across, p);
  const float lightAcc = -p.acrossK * (s.light - rest) - p.acrossDamp * s.lightVel + in.gyroAlong * p.acrossGyroGain * 10;
  s.lightVel += lightAcc * dt;
  s.light += s.lightVel * dt;
  if (s.light > LIGHT_MAX_DEG) { s.light = LIGHT_MAX_DEG; s.lightVel = fminf(0, s.lightVel); }
  if (s.light < -LIGHT_MAX_DEG) { s.light = -LIGHT_MAX_DEG; s.lightVel = fmaxf(0, s.lightVel); }

  const float shake = fminf(1, ((fabsf(in.gyroAcross) + fabsf(in.gyroAlong)) / 200) * p.shakeGain);
  s.agitation += (shake - s.agitation) * fminf(1, (shake > s.agitation ? 20 : 2) * dt);
  s.edgeLight += (clampf(along, -1, 1) - s.edgeLight) * fminf(1, 5 * dt);
  s.acrossTilt += (clampf(across, -1, 1) - s.acrossTilt) * fminf(1, 5 * dt);
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
  const float gl = 1 - expf(-2 * (float)M_PI * GYRO_LP_HZ * dt);
  lpGyroAcross += (clampf(dz(g, p.gyroDeadzone), -p.gyroMax, p.gyroMax) - lpGyroAcross) * gl;
  lpGyroAlong += (clampf(dz(raw.gyroAlong, p.gyroDeadzone), -p.gyroMax, p.gyroMax) - lpGyroAlong) * gl;
  return { lpAlong2 * p.inputGain, lpAcross2 * p.inputGain, lpGyroAlong * p.inputGain, lpGyroAcross * p.inputGain };
}
