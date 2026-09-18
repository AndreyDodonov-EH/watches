/** Unlit 3x5 label masks on the backing plane; neither brightness nor refraction belongs here. */
const DIGITS = [
  [7,5,5,5,7],[2,6,2,2,7],[7,1,7,4,7],[7,1,7,1,7],[5,5,7,1,1],
  [7,4,7,1,7],[7,4,7,5,7],[7,1,1,1,1],[7,5,7,5,7],[7,5,7,1,7],
];
export function markAt(x: number, y: number, H: number, tube: number): boolean {
  if (y < 0 || y >= H) return false;
  const unit = Math.round(x * 12 / 536);
  if (unit <= 0 || unit >= 12) return false;
  const cx = Math.round(unit * 536 / 12);
  // The backing plane is seen through the curved wall. Its visible vertical window
  // is narrower than the rectangular tube bounds, so place the two tick bands at
  // the projected wall edges rather than at 0..18% / 82..100% of the source plane.
  if (Math.abs(x - cx) < 1 && (y < H * 0.42 || y >= H * 0.58)) return true;
  const value = tube === 0 ? unit : unit * 5;
  // Wide, shallow printing remains legible under the liquid cylinder's vertical magnification.
  // This is backing artwork geometry, not a correction to the optical ray mapping.
  const sx = Math.max(1, Math.min(4, Math.floor(H / 18))), sy = Math.max(1, Math.floor(H / 48));
  const count = value >= 10 ? 2 : 1, width = (count * 4 - 1) * sx;
  const gx = Math.floor((x - (cx - Math.floor(width / 2))) / sx);
  const gy = Math.floor((y - Math.floor((H - 5 * sy) / 2)) / sy);
  if (gx < 0 || gx >= count * 4 - 1 || gy < 0 || gy >= 5 || gx % 4 === 3) return false;
  const digit = count === 2 && gx < 4 ? Math.floor(value / 10) : value % 10;
  return (DIGITS[digit][gy] & (1 << (2 - gx % 4))) !== 0;
}
