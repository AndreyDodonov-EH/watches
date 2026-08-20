// Leather cuff + acrylic vial overlay. Purely presentational (NOT ported to firmware).
// The vial "lens" is a per-row remap of the tube strip (barrel stretch toward the centre),
// drawn onto a second canvas; gloss/shadow are CSS gradients on top.
import { PANEL_W, PANEL_H, TUBE_HEIGHT_PX, HOURS_TUBE_Y, MINUTES_TUBE_Y } from '@spec/layout';

export interface OverlayOpts {
  enabled: boolean;
  lens: number;      // 0 = none, 1 = strong centre magnification
  lensCurve: number; // 0.3..3: how sharply magnification falls off toward the edges (low = gentle/uniform, high = only the centre is magnified)
  slotInset: number; // px of tube hidden under leather at each end
  slotPad: number;   // px the slot is taller than the tube (negative = leather covers tube edge)
  gloss: number;     // 0..1 opacity of the acrylic highlight
  leather: 'brown' | 'black' | 'none';
}
export const DEFAULT_OVERLAY: OverlayOpts = { enabled: true, lens: 0.6, lensCurve: 1, slotInset: 10, slotPad: -2, gloss: 0.55, leather: 'brown' };

/** Lens-distort the two tube strips from `src` canvas into `dst` canvas (same size). */
export function drawLens(src: HTMLCanvasElement, dst: HTMLCanvasElement, o: OverlayOpts): void {
  const ctx = dst.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.clearRect(0, 0, PANEL_W, PANEL_H);
  ctx.drawImage(src, 0, 0);
  if (o.lens <= 0) return;
  const H = TUBE_HEIGHT_PX;
  for (const y0 of [HOURS_TUBE_Y, MINUTES_TUBE_Y]) {
    ctx.clearRect(0, y0, PANEL_W, H);
    // Destination row yd → source row. Blend of identity and a power curve: the centre is magnified by
    // 1/(1-lens) (slope at 0 = 1-lens), the power `1+lensCurve*2` sets how abruptly the edges compress.
    for (let yd = 0; yd < H; yd++) {
      const d = (yd + 0.5 - H / 2) / (H / 2);               // -1..1
      const u = Math.abs(d);
      const s = Math.sign(d) * ((1 - o.lens) * u + o.lens * Math.pow(u, 1 + o.lensCurve * 2));
      const ys = H / 2 + s * (H / 2);
      // sample a 1px-tall band centred at ys, with sub-pixel offset via fractional source y
      ctx.drawImage(src, 0, y0 + Math.max(0, Math.min(H - 1, ys - 0.5)), PANEL_W, 1, 0, y0 + yd, PANEL_W, 1);
    }
  }
}

export const LEATHER_PAD_X = 40, LEATHER_PAD_Y = 60; // must match .leather inset in style.css

export function buildOverlayDom(root: HTMLElement): { leather: HTMLElement; slots: HTMLElement; vials: HTMLElement[] } {
  const leather = document.createElement('div');
  leather.className = 'leather';
  const slots = document.createElement('div');
  slots.className = 'slots';
  const vials: HTMLElement[] = [];
  for (const y0 of [HOURS_TUBE_Y, MINUTES_TUBE_Y]) {
    const slot = document.createElement('div');
    slot.className = 'slot';
    slot.style.top = `${y0}px`;
    const vial = document.createElement('div');
    vial.className = 'vial';
    slot.appendChild(vial);
    slots.appendChild(slot);
    vials.push(slot);
  }
  root.appendChild(leather);
  root.appendChild(slots);
  return { leather, slots, vials };
}

export function applyOverlay(dom: { leather: HTMLElement; slots: HTMLElement; vials: HTMLElement[] }, o: OverlayOpts): void {
  dom.leather.style.display = o.enabled ? 'block' : 'none';
  dom.slots.style.display = o.enabled ? 'block' : 'none';
  dom.leather.dataset.leather = o.leather;
  const w = PANEL_W - 2 * o.slotInset, h = TUBE_HEIGHT_PX + 2 * o.slotPad;
  // Punch the two slots out of the leather with a CSS mask (exclude composite).
  const holes = [HOURS_TUBE_Y, MINUTES_TUBE_Y].map((y0) =>
    `linear-gradient(#000 0 0) ${o.slotInset + LEATHER_PAD_X}px ${y0 - o.slotPad + LEATHER_PAD_Y}px / ${w}px ${h}px no-repeat`);
  const mask = `linear-gradient(#000 0 0), ${holes.join(', ')}`;
  dom.leather.style.setProperty('-webkit-mask', mask);
  dom.leather.style.setProperty('-webkit-mask-composite', 'xor');
  dom.leather.style.setProperty('mask', mask);
  dom.leather.style.setProperty('mask-composite', 'exclude');
  for (const slot of dom.vials) {
    slot.style.left = `${o.slotInset}px`;
    slot.style.width = `${w}px`;
    slot.style.height = `${h}px`;
    slot.style.marginTop = `${-o.slotPad}px`;
    (slot.firstElementChild as HTMLElement).style.opacity = String(o.gloss);
  }
}
