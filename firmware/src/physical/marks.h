#pragma once
#include <stdint.h>
#include <math.h>
namespace physical {
static const uint8_t DIGITS[10][5]={
  {7,5,5,5,7},{2,6,2,2,7},{7,1,7,4,7},{7,1,7,1,7},{5,5,7,1,1},
  {7,4,7,1,7},{7,4,7,5,7},{7,1,1,1,1},{7,5,7,5,7},{7,5,7,1,7}
};
inline bool markAt(int x,float y,int H,int tube) {
  if(y<0||y>=H) return false;
  int unit=(int)roundf(x*12.0f/536);
  if(unit<=0||unit>=12) return false;
  int cx=(int)roundf(unit*536.0f/12);
  if(abs(x-cx)<1&&(y<H*0.42f||y>=H*0.58f)) return true;
  int value=tube==0 ? unit : unit*5;
  int sx=H/18;if(sx<1)sx=1;if(sx>4)sx=4;
  int sy=H/48;if(sy<1)sy=1;
  int count=value>=10 ? 2 : 1,width=(count*4-1)*sx;
  int gx=(int)floorf((float)(x-(cx-width/2))/sx),gy=(int)floorf((y-(H-5*sy)/2)/sy);
  if(gx<0||gx>=count*4-1||gy<0||gy>=5||gx%4==3)return false;
  int digit=count==2&&gx<4 ? value/10 : value%10;
  return (DIGITS[digit][gy]&(1<<(2-gx%4)))!=0;
}
}
