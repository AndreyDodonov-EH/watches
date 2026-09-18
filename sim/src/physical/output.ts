import { decode, encode, type RGB } from './optics';
export function quantize(c: RGB): number {
  const r = Math.round(encode(c.r) * 255), g = Math.round(encode(c.g) * 255), b = Math.round(encode(c.b) * 255);
  return ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3);
}
export function linear565(c: number): RGB {
  const r = (c >> 11) & 31, g = (c >> 5) & 63, b = c & 31;
  return { r: decode(((r << 3) | (r >> 2)) / 255), g: decode(((g << 2) | (g >> 4)) / 255), b: decode(((b << 3) | (b >> 2)) / 255) };
}
export function blendLinear565(a: number, b: number, k: number): number {
  const A = linear565(a), B = linear565(b);
  return quantize({ r: A.r + k * (B.r - A.r), g: A.g + k * (B.g - A.g), b: A.b + k * (B.b - A.b) });
}
export function blitPhysical(pixels: Uint16Array, image: ImageData): void {
  for (let i = 0; i < pixels.length; i++) {
    const c = pixels[i], r = (c >> 11) & 31, g = (c >> 5) & 63, b = c & 31, j = i * 4;
    image.data[j] = (r << 3) | (r >> 2); image.data[j + 1] = (g << 2) | (g >> 4);
    image.data[j + 2] = (b << 3) | (b >> 2); image.data[j + 3] = 255;
  }
}
