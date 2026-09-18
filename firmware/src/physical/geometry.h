#pragma once
#include "lighting.h"
namespace physical {
struct Layout { int H,yH,yM; };
inline Layout layout(const Params &p) { return {(int)roundf(2*(p.innerRadiusMm+p.wallThicknessMm)/0.083f),(int)p.hoursY,(int)p.minutesY}; }
inline float circleDistance(Vec o,Vec d,float radius) {
  float b=dot(o,d),c=dot(o,o)-radius*radius,disc=b*b-c;
  if(disc<0) return -1;
  float q=sqrtf(disc), near=-b-q,far=-b+q;
  return near>1e-5f ? near : far>1e-5f ? far : -1;
}
inline Vec advance(Vec o,Vec d,float t) { return {o.y+d.y*t,o.z+d.z*t}; }
struct OpticalPath { float distance,transmission,reflection,backY; };
// Single transmitted branch, at most four interfaces. See sim/physical/geometry.ts.
inline OpticalPath traceRow(float y,bool wet,const Params &p) {
  float R=p.innerRadiusMm+p.wallThicknessMm,r=p.innerRadiusMm;
  OpticalPath path={0,0,0,0};
  if(fabsf(y)>=R) return path;
  Vec o={y,sqrtf(R*R-y*y)},d={0,-1},normal={o.y/R,o.z/R};
  float F=fresnel(-dot(d,normal),1,p.wallIor),dn=dot(d,normal);
  Vec reflected={d.y-2*dn*normal.y,d.z-2*dn*normal.z};
  path.reflection=F*environment(reflected,p);
  Vec next;
  if(!refract(d,normal,1,p.wallIor,next)) return path;
  d=next; float through=1-F;
  float entry=circleDistance(o,d,r);
  if(entry>0) {
    o=advance(o,d,entry); normal={o.y/r,o.z/r};
    float n=wet ? p.liquidIor : 1;
    through*=1-fresnel(-dot(d,normal),p.wallIor,n);
    if(!refract(d,normal,p.wallIor,n,next)) return path;
    d=next;
    float exit=circleDistance(o,d,r);
    if(exit<=0) return path;
    if(wet) path.distance=exit;
    o=advance(o,d,exit);normal={-o.y/r,-o.z/r};
    through*=1-fresnel(-dot(d,normal),n,p.wallIor);
    if(!refract(d,normal,n,p.wallIor,next)) return path;
    d=next;
  }
  float exit=circleDistance(o,d,R);
  if(exit<=0) return path;
  o=advance(o,d,exit);normal={-o.y/R,-o.z/R};
  through*=1-fresnel(-dot(d,normal),p.wallIor,1);
  if(!refract(d,normal,p.wallIor,1,next)||next.z>=-1e-5f) return path;
  d=next; float t=(-R-o.z)/d.z;
  if(t<0) return path;
  path.backY=o.y+d.y*t;path.transmission=through;
  return path;
}
}
