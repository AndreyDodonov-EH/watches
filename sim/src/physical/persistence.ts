import type { PhysicalParams } from './model';
import { PHYSICAL_VERSION, validatePhysicalParams } from './model';

const KEY = 'liquid-watch:physical-lab:v1';
export type Envelope = { kind: 'liquid-watch-physical'; version: 1; params: PhysicalParams };

export function loadPhysical(): PhysicalParams | null {
  try { const raw = localStorage.getItem(KEY); return raw ? validateEnvelope(JSON.parse(raw)).params : null; }
  catch { return null; }
}
export function savePhysical(params: PhysicalParams): void {
  localStorage.setItem(KEY, JSON.stringify({ kind: 'liquid-watch-physical', version: PHYSICAL_VERSION, params } satisfies Envelope));
}
export function exportPhysical(params: PhysicalParams): string {
  return JSON.stringify({ kind: 'liquid-watch-physical', version: 1, params } satisfies Envelope, null, 2);
}
export function importPhysical(text: string): PhysicalParams {
  return validateEnvelope(JSON.parse(text)).params;
}
function validateEnvelope(value: unknown): Envelope {
  if (!value || typeof value !== 'object') throw new Error('Expected a physical renderer JSON object.');
  const o = value as Record<string, unknown>;
  if (o.kind !== 'liquid-watch-physical' || o.version !== 1) throw new Error('This file is not a physical lab configuration (legacy configs are rejected).');
  return { kind: 'liquid-watch-physical', version: 1, params: validatePhysicalParams(o.params) };
}
