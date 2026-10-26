# Research script for the Sea Battle originals (see docs/brick/sea-battle-originals.md): traces the owner's cup icon (a clean black PNG: cup with steam and saucer)
# into the compact SVG path used by src/render/seaCup.ts.
# usage: sea_cup_trace.py cup.png [epsilon_px=1.4] [width_units=50]   (the PNG itself is not stored in the repository)
import sys, cv2, numpy as np
from scipy.ndimage import gaussian_filter1d

src = sys.argv[1]; eps = float(sys.argv[2]) if len(sys.argv) > 2 else 1.4; width = float(sys.argv[3]) if len(sys.argv) > 3 else 50.0
im = cv2.imread(src, cv2.IMREAD_UNCHANGED)
ink = ((im[:, :, 3] > 128) & (im[:, :, :3].mean(axis=2) < 128)).astype(np.uint8) * 255
ys, xs = np.where(ink > 0)
x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
scale = width / (x1 - x0); cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
contours, _ = cv2.findContours(ink, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)

def smooth(points):
    """Closed Catmull-Rom spline through the simplified points, as cubic Beziers."""
    n = len(points); d = []
    fmt = lambda v: f'{v:.1f}'.rstrip('0').rstrip('.')
    p = lambda i: points[i % n]
    d.append(f'M{fmt(p(0)[0])} {fmt(p(0)[1])}')
    for i in range(n):
        p0, p1, p2, p3 = p(i - 1), p(i), p(i + 1), p(i + 2)
        c1 = p1 + (p2 - p0) / 6; c2 = p2 - (p3 - p1) / 6
        d.append(f'C{fmt(c1[0])} {fmt(c1[1])} {fmt(c2[0])} {fmt(c2[1])} {fmt(p2[0])} {fmt(p2[1])}')
    return ''.join(d) + 'Z'

parts = []
for c in contours:
    if cv2.contourArea(c) < 30: continue
    pts = c[:, 0, :].astype(float)
    pts = np.stack([gaussian_filter1d(pts[:, k], 2.5, mode='wrap') for k in (0, 1)], axis=1)  # the PNG is clean; this only removes pixel stair-steps before fitting
    simple = cv2.approxPolyDP(pts.astype(np.float32).reshape(-1, 1, 2), eps, True)[:, 0, :].astype(float)
    if len(simple) < 3: continue
    simple = (simple - [cx, cy]) * scale
    parts.append(smooth(simple))
path = ''.join(parts)
height = (y1 - y0) * scale
print(f'// {len(parts)} contours, {len(path)} chars, size {width:.1f} x {height:.1f}', file=sys.stderr)
print(path)
