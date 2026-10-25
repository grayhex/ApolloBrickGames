# Research script for the Sea Battle originals (see docs/brick/sea-battle-originals.md): Check: side-by-side of the video crops and the sampled states.
# Inputs (the owner's videos, frames, intermediate JSON) are not stored in the repository.
import json, sys
import numpy as np, cv2
res = json.load(open(sys.argv[1])); cropdir = sys.argv[2]; thr = float(sys.argv[3]); out = sys.argv[4]
idx = [int(v) for v in sys.argv[5].split(',')]
M = np.array([r['m'] for r in res]); T = len(M)
S = M.copy()
for t in range(T):
    lo, hi = max(0, t - 2), min(T, t + 3); S[t] = np.median(M[lo:hi], axis=0)
tiles = []
for i in idx:
    im = cv2.imread(f'{cropdir}/a_{i:04d}.png')
    if im is None: print('missing crop', i); continue
    h, w = im.shape[:2]
    cell = 14
    pic = np.full((20 * cell + 4, 10 * cell + 4, 3), 235, np.uint8)
    for r in range(20):
        for c in range(10):
            if S[i, r, c] < thr:
                cv2.rectangle(pic, (2 + c * cell, 2 + r * cell), (2 + c * cell + cell - 2, 2 + r * cell + cell - 2), (40, 40, 40), -1)
            else:
                cv2.rectangle(pic, (2 + c * cell + 5, 2 + r * cell + 5), (2 + c * cell + 7, 2 + r * cell + 7), (200, 200, 200), -1)
    imr = cv2.resize(im, (int(w * 284 / h), 284))
    pic = cv2.resize(pic, (int(pic.shape[1] * 284 / pic.shape[0]), 284))
    tile = np.hstack([imr, pic, np.full((284, 6, 3), 255, np.uint8)])
    cv2.putText(tile, str(i), (2, 14), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 1)
    tiles.append(tile)
per = int(sys.argv[6]) if len(sys.argv) > 6 else 5
rows = []
for k in range(0, len(tiles), per):
    row = tiles[k:k + per]
    wmax = max(t.shape[1] for t in tiles)
    row = [cv2.copyMakeBorder(t, 0, 0, 0, wmax - t.shape[1], cv2.BORDER_CONSTANT, value=(255, 255, 255)) for t in row]
    while len(row) < per: row.append(np.full((284, wmax, 3), 255, np.uint8))
    rows.append(np.hstack(row))
cv2.imwrite(out, np.vstack(rows)); print(np.vstack(rows).shape)
