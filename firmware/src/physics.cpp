#include "physics.h"
#include "layout.h"
#include <math.h>
#include <string.h>

static inline float clampf(float v, float lo, float hi) { return v < lo ? lo : v > hi ? hi : v; }
static inline float dz(float v, float d) { return fabsf(v) < d ? 0 : v - (v > 0 ? d : -d); }
static inline float jroundf(float x) { return floorf(x + 0.5f); }   // JS Math.round

// One static residue buffer per tube (deterministic footprint, filled by stepTube)
static uint16_t g_trace[2][TUBE_LENGTH_PX];
uint16_t *traceBuf(int i) { return g_trace[i & 1]; }

// Per-column unevenness of the dried traces: high 16 bits scatter the decay rates, low 16 the
// stain floor. Same integer hash as the sim's traceUneven (salted differently from traceStreak).
static inline uint32_t traceUneven(uint32_t n) {
  uint32_t h = (n ^ 0x27D4EB2Fu) * 2654435761u + 0x9E3779B9u;
  h ^= h >> 15; h *= 2246822519u; h ^= h >> 13;
  return h;
}

// Highlight rest angle: world-up in the tube cross-section, halved (specular seen along the
// normal), blended with the fixed style angle by lightPhys. See sim lightRest.
float lightRest(float along, float across, const Params &p) {
  float n = sqrtf(fmaxf(0, 1 - along * along - across * across));
  float phys = atan2f(across, n) * 180 / (float)M_PI / 2;
  return p.lightAngle + (phys - p.lightAngle) * p.lightPhys;
}

float columnLen(float fillTarget, const Params &p) { return (p.remaining ? 1 - fillTarget : fillTarget) * TUBE_LENGTH_PX; }

void stepTube(TubeState &s, const TiltInput &in, const Params &p, float dt) {
  const float along = dz(in.along, p.deadzone);
  const float across = dz(in.across, p.deadzone);

  const float fillRest = clampf(along * p.fillSloshGain, -FILL_SLOSH_MAX_PX, FILL_SLOSH_MAX_PX);
  const float fillKick = in.gyroAcross * p.angleGyroGain * 4;
  const float fillAcc = -p.fillK * (s.fillPos - fillRest) - p.fillDamp * s.fillVel + fillKick;
  s.fillVel += fillAcc * dt;
  s.fillPos += s.fillVel * dt;
  if (s.fillPos > FILL_SLOSH_MAX_PX) { s.fillPos = FILL_SLOSH_MAX_PX; s.fillVel = fminf(0, s.fillVel); }
  if (s.fillPos < -FILL_SLOSH_MAX_PX) { s.fillPos = -FILL_SLOSH_MAX_PX; s.fillVel = fmaxf(0, s.fillVel); }

  // Reading gesture: a wrist turn then the reading pose (face up, tube level) → readHold s read. See sim.
  const float turn = fabsf(in.gyroAlong) + fabsf(in.gyroAcross);
  const float motionT = p.readTurn <= 0 ? 1 : fminf(1, turn / p.readTurn);
  s.motion += (motionT - s.motion) * fminf(1, (motionT > s.motion ? 20 : 1.5f) * dt);
  const float faceUp = sqrtf(fmaxf(0, 1 - along * along - across * across));
  const bool inPose = faceUp >= p.readFaceUp && fabsf(along) <= p.readAlongMax;
  if (s.motion > 0.5f) s.armed = true;
  if (!inPose) s.readTimer = 0;
  else if (s.armed && s.motion < 0.25f) { s.armed = false; s.readTimer = p.readHold; }
  s.readTimer = fmaxf(0, s.readTimer - dt);
  s.reading += ((!p.freeLiquid || s.readTimer > 0 ? 1 : 0) - s.reading) * fminf(1, 4 * dt);

  // Free liquid: slug slides under along-gravity with drag, bounces at the ends, parked home while reading.
  const float travel = fmaxf(0, TUBE_LENGTH_PX - columnLen(s.fillTarget, p));
  const float home = p.remaining ? travel : 0;
  float slugAcc = 0;
  if (!p.freeLiquid) { s.slugPos = home; s.slugVel = 0; }
  else {
    slugAcc = along * p.freeGain - p.freeDamp * s.slugVel
      + s.reading * (-p.freeHomeK * (s.slugPos - home) - 2 * sqrtf(p.freeHomeK) * s.slugVel);
    const float v0 = s.slugVel;
    s.slugVel += slugAcc * dt;
    s.slugPos += s.slugVel * dt;
    if (s.slugPos <= 0 || s.slugPos >= travel) {   // wall carries the load; the hit is an impulse
      const bool hit = s.slugPos <= 0 ? s.slugVel < 0 : s.slugVel > 0;
      s.slugPos = s.slugPos <= 0 ? 0 : travel;
      if (hit) s.slugVel = -s.slugVel * p.freeBounce;
      slugAcc = hit ? (s.slugVel - v0) / dt * 0.25f : 0;
    }
  }

  // Meniscus dynamics: centre pushed ahead of the contact lines by edge acceleration (inertia) and
  // velocity (contact-angle hysteresis), springing back with a wobble.
  const float edgeVel = s.fillVel + s.slugVel, edgeAcc = fillKick + slugAcc;   // forcing only, see sim
  const float capRest = p.contactLag * edgeVel * 0.1f;
  const float capAcc = -p.meniscusK * (s.cap - capRest) - p.meniscusDamp * s.capVel + p.meniscusInertia * edgeAcc;
  s.capVel += capAcc * dt;
  s.cap += s.capVel * dt;
  if (s.cap > CAP_DYN_MAX_PX) { s.cap = CAP_DYN_MAX_PX; s.capVel = fminf(0, s.capVel); }
  if (s.cap < -CAP_DYN_MAX_PX) { s.cap = -CAP_DYN_MAX_PX; s.capVel = fmaxf(0, s.capVel); }

  // Wet film: fast attack while an edge recedes, slow drain.
  const float recede = p.remaining ? 1 : -1;
  auto filmT = [](float v) { return clampf(v / FILM_FULL_PX_S, 0, 1); };
  auto follow = [dt](float cur, float target) { return cur + (target - cur) * fminf(1, (target > cur ? 15 : 2) * dt); };
  s.filmFree = follow(s.filmFree, filmT(recede * edgeVel));
  s.filmHome = follow(s.filmHome, p.freeLiquid ? filmT(-recede * s.slugVel) : 0);

  // Dried traces: the mid-row edges the renderer draws, in the panel frame. An edge that receded
  // deposits saturated residue on the columns it uncovered; the wet part (above the per-column
  // stain floor) drains back toward the liquid — rate grows with distance, so the tail collapses
  // first and the residue follows a receded edge — while the stain dries over traceDry. See sim.
  if (p.traces && s.trace) {
    const float len = columnLen(s.fillTarget, p);
    const float fp = clampf(s.fillPos, -len, len);
    const float xt = p.remaining ? s.slugPos + fp : (p.freeLiquid ? s.slugPos : 0.0f) + len + fp;
    const float xh = p.remaining ? len + s.slugPos : (p.freeLiquid ? s.slugPos : 0.0f);
    if (!s.traceInit) s.traceInit = true;
    else {
      // deposit thins with edge speed (traceThin): a fast sweep stretches the film, so the residue
      // densifies toward where the edge slowed down — i.e. toward the liquid (see sim)
      auto dep = [&](float a, float b) {
        if (b <= a) return;
        uint16_t v = (uint16_t)fmaxf(TRACE_MIN + 1, jroundf(TRACE_FULL / (1.0f + p.traceThin * ((b - a) / dt) / TRACE_THIN_REF_PX_S)));
        int lo = (int)fmaxf(0, jroundf(a)), hi = (int)fminf((float)TUBE_LENGTH_PX, jroundf(a + fminf(b - a, TRACE_DEPOSIT_MAX_PX)));
        for (int x = lo; x < hi; x++) s.trace[x] = v;
        if (hi > lo) { if (lo < s.traceLo) s.traceLo = (int16_t)lo; if (hi > s.traceHi) s.traceHi = (int16_t)hi; }
      };
      if (p.remaining) dep(s.xtPrev, xt); else dep(xt, s.xtPrev);
      if (p.freeLiquid) { if (p.remaining) dep(xh, s.xhPrev); else dep(s.xhPrev, xh); }
    }
    s.xtPrev = xt; s.xhPrev = xh;
    // Linearised rates (dt·rate ≪ 1: caps below). floorf, not round-to-nearest — with a slow
    // traceDry the per-tick decrement is under half an LSB and rounding would stall forever;
    // floor keeps the decay monotone (worst case 1 LSB/tick ⇒ even the faintest stain clears).
    const float lo = fminf(xt, xh), hi = fmaxf(xt, xh);
    const float dryTilt = 1.0f + TRACE_TILT_DRY * fabsf(along);   // a tilted tube drains its film faster
    const float dryK = fminf(0.5f, dt * dryTilt / fmaxf(0.05f, p.traceDry)), folK = p.traceFollow * dt / TRACE_FOLLOW_REF_PX;
    int nLo = TUBE_LENGTH_PX, nHi = 0;   // the occupied range re-tightens as columns dry out
    for (int x = s.traceLo; x < s.traceHi; x++) {
      float v = s.trace[x];
      if (v == 0) continue;
      const uint32_t h = traceUneven(x);
      const float u = 0.75f + 0.5f * ((h >> 16) * (1.0f / 65535.0f));
      const float stain = TRACE_FULL * p.traceStain * (0.7f + 0.3f * ((h & 0xffff) * (1.0f / 65535.0f)));
      const float dist = x < lo ? lo - x : x > hi ? x - hi : 0.0f;
      // two phases: the wet excess settles ONTO the stain (drain-back + drying), and only the
      // stain itself dries toward zero — so traceStain is the plateau the fade visibly pauses at
      if (v > stain) v = stain + (v - stain) * fmaxf(0.0f, 1.0f - u * (folK * dist + dryK));
      else v *= 1.0f - u * dryK;
      if (v < TRACE_MIN) { s.trace[x] = 0; continue; }
      s.trace[x] = (uint16_t)floorf(v);
      if (x < nLo) nLo = x;
      nHi = x + 1;
    }
    s.traceLo = (int16_t)nLo; s.traceHi = (int16_t)nHi;
  } else if (s.traceInit && s.trace) {
    s.traceInit = false; memset(s.trace, 0, TUBE_LENGTH_PX * sizeof(uint16_t));
    s.traceLo = TUBE_LENGTH_PX; s.traceHi = 0;
  }

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
