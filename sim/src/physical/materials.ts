import { DEFAULT_PHYSICAL_PARAMS, type PhysicalParams } from './model';
import type { PhysicalAppearance } from './appearance';

export const MATERIALS: Record<string, Partial<PhysicalParams>> = {
  // Reference temperature 20°C. IOR is nominal; oil absorption is an artistic estimate,
  // not measured sample data. Material selection preserves vessel and scene settings.
  'olive oil': { liquidIor: 1.47, absorptionR: 0.09, absorptionG: 0.12, absorptionB: 0.8 },
  'clear water': { liquidIor: 1.333, absorptionR: 0, absorptionG: 0, absorptionB: 0 },
};

/** Backing and mark colours are display/art-direction choices, separate from material physics. */
export const BACKGROUNDS: Record<string, string> = {
  'neutral black': '#ffffff',
  'warm paper': '#e6d4a6',
  'slate': '#9aa8ae',
  'amber': '#d99b3d',
};
export const DIGITS: Record<string, string> = {
  'white': '#ffffff',
  'warm white': '#f5e6b0',
  'steel': '#d5e0e5',
  'cyan': '#8be7ef',
  'amber': '#f0bd63',
};

export const DEFAULT_APPEARANCE_NAMES = {
  background: 'neutral black',
  digits: 'white',
} as const;

export function appearance(background: string, digits: string): PhysicalAppearance {
  return {
    background: BACKGROUNDS[background] ?? BACKGROUNDS[DEFAULT_APPEARANCE_NAMES.background],
    digits: DIGITS[digits] ?? DIGITS[DEFAULT_APPEARANCE_NAMES.digits],
  };
}

export function material(name: string, base = DEFAULT_PHYSICAL_PARAMS): PhysicalParams {
  return { ...base, ...(MATERIALS[name] ?? {}) } as PhysicalParams;
}
