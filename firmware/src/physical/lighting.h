#pragma once
#include "model.h"
#include "optics.h"
namespace physical {
inline float environment(Vec direction,const Params &p) {
  float angle=atan2f(direction.y,direction.z)*180.0f/(float)M_PI;
  float delta=fmodf(angle-p.lightAngleDeg+540,360)-180, sigma=p.lightSizeDeg/2.355f;
  return p.ambientIntensity+p.lightIntensity*expf(-0.5f*(delta/sigma)*(delta/sigma));
}
inline float backingLight(const Params &p) {
  return p.ambientIntensity+p.lightIntensity*fmaxf(0,cosf(p.lightAngleDeg*(float)M_PI/180))*sinf(p.lightSizeDeg*(float)M_PI/360);
}
}
