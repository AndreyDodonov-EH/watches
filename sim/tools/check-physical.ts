// Headless invariants for the physical renderer's TypeScript reference.
// The native frame comparison is orchestrated by firmware/tools/check_physical.py.
declare const process: { argv: string[] };
declare const Buffer: any;
declare function require(moduleName: string): any;

import { DEFAULT_PHYSICAL_PARAMS, validatePhysicalParams, type PhysicalParams } from '../src/physical/model';
import { physicalLayout, traceRow } from '../src/physical/geometry';
import { beer, fresnel, refract } from '../src/physical/optics';
import { PhysicalRenderer } from '../src/physical/render';

const fs = require('fs');

function fail(message: string): never {
  throw new Error(`physical check failed: ${message}`);
}

function assert(condition: boolean, message: string): void {
  if (!condition) fail(message);
}

function close(actual: number, expected: number, tolerance = 1e-6): void {
  assert(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

function assertThrows(value: unknown, message: string): void {
  let threw = false;
  try {
    validatePhysicalParams(value);
  } catch {
    threw = true;
  }
  assert(threw, message);
}

function checkOptics(): void {
  const normal = ((1.0 - 1.5) / (1.0 + 1.5)) ** 2;
  close(fresnel(1, 1, 1.5), normal);
  close(fresnel(1, 1.5, 1.5), 0);
  close(fresnel(0, 1.5, 1.5), 0);
  close(fresnel(0.5, 1.5, 1), 1);
  assert(refract({ y: 0.8660254, z: -0.5 }, { y: 0, z: 1 }, 1.5, 1) === null, 'TIR must terminate refraction');

  close(beer(0.8, 1.0), beer(0.8, 0.4) * beer(0.8, 0.6));
  assert(beer(0.8, 0.2) > beer(0.8, 0.8), 'a thinner film must transmit more light');

  const p = { ...DEFAULT_PHYSICAL_PARAMS };
  const central = traceRow(0, true, p);
  close(central.distance, 2 * p.innerRadiusMm, 1e-5);
  for (const innerRadiusMm of [0.5, 1, 2.55, 3]) {
    for (const wallThicknessMm of [0.05, 0.45, 0.9]) {
      const sample = { ...p, innerRadiusMm, wallThicknessMm };
      const R = innerRadiusMm + wallThicknessMm;
      for (let i = 0; i < 17; i++) {
        const y = (-1 + (i + 0.5) / 17 * 2) * R;
        for (const wet of [false, true]) {
          const path = traceRow(y, wet, sample);
          for (const value of [path.distance, path.transmission, path.reflection, path.backY]) {
            assert(Number.isFinite(value), `non-finite optical path at R=${R}, y=${y}`);
          }
          assert(path.transmission >= -1e-6 && path.transmission <= 1 + 1e-6, 'transmission outside [0,1]');
          assert(path.reflection >= -1e-6, 'negative reflected radiance');
        }
      }
    }
  }
}

function checkSchema(): void {
  const p = { ...DEFAULT_PHYSICAL_PARAMS };
  validatePhysicalParams(p);
  assertThrows({ ...p, extra: 1 }, 'unknown field accepted');
  const missing = { ...p } as Partial<PhysicalParams>;
  delete missing.exposure;
  assertThrows(missing, 'missing field accepted');
  assertThrows({ ...p, exposure: Number.NaN }, 'NaN accepted');
  assertThrows({ ...p, exposure: Number.POSITIVE_INFINITY }, 'infinity accepted');
  assertThrows({ ...p, hoursY: 1.5 }, 'fractional layout coordinate accepted');
  assertThrows({ ...p, minutesY: 20 }, 'overlapping strips accepted');
  assertThrows({ ...p, innerRadiusMm: 2.5, wallThicknessMm: 0.8, minutesY: 70 }, 'wall-only overlap accepted');
  assertThrows({ ...p, innerRadiusMm: 2.5, wallThicknessMm: 0.8, minutesY: 180 }, 'outer-radius strip went off panel');
  assertThrows({ ...p, innerRadiusMm: 3, wallThicknessMm: 0.5 }, 'wall thickness constraint missed');
  const H = physicalLayout(p).H;
  const adjacent = { ...p, minutesY: H };
  validatePhysicalParams(adjacent);
}

function checkRendererCache(): void {
  const renderer = new PhysicalRenderer();
  const p = { ...DEFAULT_PHYSICAL_PARAMS };
  const first = renderer.render(p, 0.43, 0.57).slice();
  assert(first.length === 536 * 240, 'unexpected TypeScript framebuffer size');
  renderer.render(p, 0.43, 0.57);
  assert(renderer.lastRebuildMs === 0, 'unchanged TypeScript params rebuilt cache');
  const changed = { ...p, exposure: 1.5 };
  const second = renderer.render(changed, 0.43, 0.57).slice();
  assert(second.length === first.length, 'changed TypeScript frame size');
  let changedPixel = false;
  for (let i = 0; i < first.length; i++) if (first[i] !== second[i]) { changedPixel = true; break; }
  assert(changedPixel, 'material edit did not affect TypeScript frame');
}

function writeFrame(): void {
  const job = JSON.parse(fs.readFileSync(process.argv[3], 'utf8')) as { params: PhysicalParams; hours: number; minutes: number };
  const output = process.argv[4];
  if (!output) fail('frame mode needs an output path');
  const renderer = new PhysicalRenderer();
  const frame = renderer.render(validatePhysicalParams(job.params), job.hours, job.minutes);
  fs.writeFileSync(output, Buffer.from(frame.buffer, frame.byteOffset, frame.byteLength));
}

function writeLayout(): void {
  const job = JSON.parse(fs.readFileSync(process.argv[3], 'utf8')) as { params: PhysicalParams };
  const params = validatePhysicalParams(job.params);
  console.log(physicalLayout(params).H);
}

if (process.argv[2] === '--frame') writeFrame();
else if (process.argv[2] === '--layout') writeLayout();
else {
  checkOptics();
  checkSchema();
  checkRendererCache();
  console.log('physical TypeScript invariants: ok');
}
