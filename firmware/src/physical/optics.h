#pragma once
#include <math.h>
namespace physical {
struct Vec { float y, z; };
struct RGB { float r, g, b; };
inline float dot(Vec a, Vec b) { return a.y*b.y + a.z*b.z; }
inline float fresnel(float cosI, float n1, float n2) {
  if (n1 == n2) return 0;
  float c = fmaxf(0, fminf(1, cosI));
  float eta = n1/n2, sinT2 = eta*eta*(1-c*c);
  if (sinT2 >= 1) return 1;
  float ct = sqrtf(1-sinT2);
  float rs = (n1*c-n2*ct)/(n1*c+n2*ct), rp = (n2*c-n1*ct)/(n2*c+n1*ct);
  return (rs*rs+rp*rp)*0.5f;
}
// Normal points into the incident medium; false denotes total internal reflection.
inline bool refract(Vec d, Vec normal, float n1, float n2, Vec &out) {
  float c = fmaxf(0, fminf(1, -dot(d,normal))), eta=n1/n2;
  float k=1-eta*eta*(1-c*c);
  if (k<0) return false;
  float a=eta*c-sqrtf(k);
  out={eta*d.y+a*normal.y,eta*d.z+a*normal.z}; return true;
}
inline float beer(float sigma, float distance) { return expf(-sigma*distance); }
inline float decode(float v) { return v<=0.04045f ? v/12.92f : powf((v+0.055f)/1.055f,2.4f); }
inline float encode(float v) {
  v=fmaxf(0,fminf(1,v));
  return v<=0.0031308f ? 12.92f*v : 1.055f*powf(v,1.0f/2.4f)-0.055f;
}
}
