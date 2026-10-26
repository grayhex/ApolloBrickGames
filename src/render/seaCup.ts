/** Clean, hand-drawn vector of the owner's cup: bowl, coffee rim, handle, saucer and steam.
 * No photographic threshold contours or texture. Coordinates relative to a 54 × 28 icon.
 */
export const SEA_CUP = {x:209.7, y:304.7, width:54, height:28} as const;
const OUTLINE = `M-22 -6 C-24 0 -16 10 -6 11 C3 12 10 4 13 -5
 C19 -17 -33 -15 -22 -6Z
 M-19 -7 C-17 -12 8 -12 10 -7 C8 -2 -16 -2 -19 -7Z
 M-18 -1 C-15 4 -10 8 -5 8 C1 8 6 4 9 -1 C1 2 -10 3 -18 -1Z
 M13 -8 C20 -18 31 -11 22 -2 C19 1 15 2 11 0 L13 -3
 C19 -2 25 -10 21 -11 C18 -12 16 -7 15 -5Z
 M-17 5 C-41 10 -27 18 -2 17 C24 17 31 8 16 5 L14 7
 C24 11 13 14 -3 14 C-22 14 -31 10 -18 8Z
 M-7 -4 C-13 -8 -3 -12 -9 -17 C-9 -13 -16 -8 -7 -4Z
 M1 -5 C-4 -9 6 -13 0 -18 C2 -12 -7 -9 1 -5Z`;
export function seaCupPath(x: number = SEA_CUP.x, y: number = SEA_CUP.y): Path2D {
  const path = new Path2D();
  path.addPath(new Path2D(OUTLINE), new DOMMatrix().translate(x, y).scale(1, .78));
  return path;
}
