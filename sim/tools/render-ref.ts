// Headless reference render: reads a JSON {params, hours, minutes, sprite:{i,w,h,cellW,cellH,widths,rgbaFile}}
// from argv[2], renders one frame exactly as the browser sim would (fizz must be off), writes the
// 536x240 RGB565 framebuffer (little-endian u16) to argv[3]. Used by firmware/tools/compare-device.py.
// Run: see compare-device.py (compiles with tsc like check:imu).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require('fs'); declare const process: any; declare const Buffer: any; declare function require(m: string): any;
import { renderFrame, fb, setSprite } from '../src/render';
import type { TubeState } from '../src/physics';

const job = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (job.sprite) {
  const sp = job.sprite;
  const data = new Uint8ClampedArray(fs.readFileSync(sp.rgbaFile));
  setSprite(sp.i, { cellW: sp.cellW, cellH: sp.cellH, widths: sp.widths, data, w: sp.w, h: sp.h });
}
const h: TubeState = job.hours, m: TubeState = job.minutes;
renderFrame(h, m, job.params);
fs.writeFileSync(process.argv[3], Buffer.from(fb.buffer, fb.byteOffset, fb.byteLength));
console.log('ok');
