#include "render.h"
#include "marks.h"
#include "output.h"
#include <string.h>
#ifdef ARDUINO
#include "esp_heap_caps.h"
#endif
namespace physical {
static constexpr int W=536,MAX_H=80;
static constexpr size_t LAYER_PIXELS=2*2*W*MAX_H;
static uint16_t *layers=nullptr;
struct Context { uint32_t gen=0; bool valid=false; };
static Context contexts[2];
static bool initAttempted=false;
bool init() {
  if(initAttempted)return layers!=nullptr;
  initAttempted=true;
#ifdef ARDUINO
  layers=(uint16_t*)heap_caps_malloc(LAYER_PIXELS*sizeof(uint16_t),MALLOC_CAP_SPIRAM);
#else
  static uint16_t hostLayers[LAYER_PIXELS]; // native reference: fixed BSS, never heap
  layers=hostLayers;
#endif
  return layers!=nullptr;
}
size_t memoryBytes(){return LAYER_PIXELS*sizeof(uint16_t)+sizeof(contexts);}
static RGB colour(const Params &p,const OpticalPath &path,float gain,float albedo) {
  return {p.exposure*(path.reflection+gain*albedo*beer(p.absorptionR,path.distance)),
          p.exposure*(path.reflection+gain*albedo*beer(p.absorptionG,path.distance)),
          p.exposure*(path.reflection+gain*albedo*beer(p.absorptionB,path.distance))};
}
static void rebuild(int tube,const Params &p) {
  int H=layout(p).H;float R=p.innerRadiusMm+p.wallThicknessMm,irradiance=backingLight(p);
  for(int medium=0;medium<2;medium++)for(int y=0;y<H;y++) {
    OpticalPath path=traceRow(((y+0.5f)/H*2-1)*R,medium==1,p);
    float gain=path.transmission*irradiance;
    uint16_t bg=__builtin_bswap16(quantize(colour(p,path,gain,p.backingReflectance)));
    uint16_t mark=__builtin_bswap16(quantize(colour(p,path,gain,p.marksReflectance)));
    float sy=(path.backY/R+1)*H*0.5f;
    uint16_t *row=layers+(tube*2+medium)*W*MAX_H+y*W;
    for(int x=0;x<W;x++)row[x]=path.transmission>0&&markAt(x,sy,H,tube)?mark:bg;
  }
}
void renderTube(int idx,float fill,const Params &p,uint32_t gen,uint16_t *strip) {
  if(!layers||!strip||idx<0||idx>1||!validate(p)||!isfinite(fill))return;
  Context &ctx=contexts[idx];
  if(!ctx.valid||ctx.gen!=gen){rebuild(idx,p);ctx.gen=gen;ctx.valid=true;}
  int H=layout(p).H;
  float edge=fmaxf(0,fminf(1,fill))*W;int xi=(int)floorf(edge);float alpha=edge-xi;
  const uint16_t *dry=layers+idx*2*W*MAX_H,*wet=dry+W*MAX_H;
  for(int y=0;y<H;y++) {
    int row=y*W;
    memcpy(strip+row,wet+row,xi*sizeof(uint16_t));
    memcpy(strip+row+xi,dry+row+xi,(W-xi)*sizeof(uint16_t));
    if(xi<W&&alpha>0)strip[row+xi]=__builtin_bswap16(blendLinear565(__builtin_bswap16(dry[row+xi]),__builtin_bswap16(wet[row+xi]),alpha));
  }
}
}
