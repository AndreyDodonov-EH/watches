#pragma once
#include <stdint.h>
#include "optics.h"
namespace physical {
inline uint16_t quantize(RGB c) {
  int r=(int)roundf(encode(c.r)*255),g=(int)roundf(encode(c.g)*255),b=(int)roundf(encode(c.b)*255);
  return (uint16_t)(((r>>3)<<11)|((g>>2)<<5)|(b>>3));
}
inline RGB linear565(uint16_t c) {
  int r=(c>>11)&31,g=(c>>5)&63,b=c&31;
  return {decode(((r<<3)|(r>>2))/255.0f),decode(((g<<2)|(g>>4))/255.0f),decode(((b<<3)|(b>>2))/255.0f)};
}
inline uint16_t blendLinear565(uint16_t a,uint16_t b,float k) {
  RGB A=linear565(a),B=linear565(b);
  return quantize({A.r+k*(B.r-A.r),A.g+k*(B.g-A.g),A.b+k*(B.b-A.b)});
}
}
