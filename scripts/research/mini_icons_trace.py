# Research script for Mini Brick Game B-S96 (see docs/minibrick.md): traces the owner's column of 13 black scale icons (crown, star, mushroom, eggplant, agave, pepper,
# pineapple, watermelon, stacked pieces, grapes, tomato, bananas, cherries) into compact SVG paths used by src/render/miniIcons.ts.
# usage: mini_icons_trace.py column.png [epsilon_px=1.5] > src/render/miniIcons.ts   (the PNG itself is not stored in the repository)
# All icons share one scale (the widest icon is 100 units), so their relative sizes stay as printed; every path is centred on its own bounding box.
import sys, json, cv2, numpy as np
from scipy.ndimage import gaussian_filter1d

src = sys.argv[1]; eps = float(sys.argv[2]) if len(sys.argv) > 2 else 1.5
im = cv2.imread(src, cv2.IMREAD_UNCHANGED)
ink = ((im[:, :, 3] > 128) & (im[:, :, :3].mean(axis=2) < 128)).astype(np.uint8) * 255

# Split the column into bands of ink separated by empty rows.
rows = np.where(ink.any(axis=1))[0]
bands, start = [], rows[0]
for a, b in zip(rows, rows[1:]):
    if b - a > 2: bands.append((start, a)); start = b
bands.append((start, rows[-1]))
assert len(bands) == 13, f'expected 13 icons, found {len(bands)}'
widths = [np.where(ink[y0:y1 + 1].any(axis=0))[0] for y0, y1 in bands]
scale = 100.0 / max(w.max() - w.min() for w in widths)

fmt = lambda v: f'{v:.1f}'.rstrip('0').rstrip('.')

def smooth(points):
    """Closed Catmull-Rom spline through the simplified points, as cubic Beziers."""
    n = len(points); d = []
    p = lambda i: points[i % n]
    d.append(f'M{fmt(p(0)[0])} {fmt(p(0)[1])}')
    for i in range(n):
        p0, p1, p2, p3 = p(i - 1), p(i), p(i + 1), p(i + 2)
        c1 = p1 + (p2 - p0) / 6; c2 = p2 - (p3 - p1) / 6
        d.append(f'C{fmt(c1[0])} {fmt(c1[1])} {fmt(c2[0])} {fmt(c2[1])} {fmt(p2[0])} {fmt(p2[1])}')
    return ''.join(d) + 'Z'

icons = []
for (y0, y1), cols in zip(bands, widths):
    x0, x1 = cols.min(), cols.max()
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    crop = ink[y0:y1 + 1]
    contours, _ = cv2.findContours(crop, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    parts = []
    for c in contours:
        if cv2.contourArea(c) < 12: continue
        pts = c[:, 0, :].astype(float) + [0, y0]
        if len(pts) > 8:
            pts = np.stack([gaussian_filter1d(pts[:, k], 2.0, mode='wrap') for k in (0, 1)], axis=1)
        simple = cv2.approxPolyDP(pts.astype(np.float32).reshape(-1, 1, 2), eps, True)[:, 0, :].astype(float)
        if len(simple) < 3: continue
        parts.append(smooth((simple - [cx, cy]) * scale))
    icons.append({'d': ''.join(parts), 'w': round((x1 - x0) * scale, 1), 'h': round((y1 - y0) * scale, 1), 'contours': len(parts)})
names = ['crown', 'star', 'mushroom', 'eggplant', 'agave', 'pepper', 'pineapple', 'watermelon', 'pieces', 'grapes', 'tomato', 'bananas', 'cherries']
lines = [
    '/**',
    ' * Шкала из 13 значков справа от матрицы Mini Brick Game B-S96: контуры сняты с присланной владельцем колонки чёрных значков (сверху вниз: корона, звезда, гриб, баклажан,',
    ' * агава, перец, ананас, арбуз, стопка фигур, виноград, помидор, бананы, вишни). Генерируется скриптом `scripts/research/mini_icons_trace.py`; правки руками не вносить.',
    ' * Единицы: самый широкий значок — 100; начало координат каждого — центр его рамки; дырки — по правилу evenodd.',
    ' */',
    'export interface MiniIcon {',
    '  readonly name: string;',
    '  readonly d: string;',
    '  readonly w: number;',
    '  readonly h: number;',
    '}',
    '',
    'export const MINI_ICONS: readonly MiniIcon[] = [',
]
for name, icon in zip(names, icons):
    d = icon['d']
    chunks = [d[i:i + 110] for i in range(0, len(d), 110)]
    lines.append('  {')
    lines.append(f"    name: '{name}',")
    lines.append(f"    w: {icon['w']},")
    lines.append(f"    h: {icon['h']},")
    lines.append('    d:')
    for k, chunk in enumerate(chunks):
        lines.append(f"      '{chunk}'" + (' +' if k < len(chunks) - 1 else ','))
    lines.append('  },')
lines.append('];')
print('\n'.join(lines))
print('// ' + ', '.join(f"{i['w']}x{i['h']}:{len(i['d'])}" for i in icons), file=sys.stderr)
