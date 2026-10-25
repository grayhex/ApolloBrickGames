# Research script for the Sea Battle originals (see docs/brick/sea-battle-originals.md): Check: contact sheet of sampled states for visual comparison with the video.
# Inputs (the owner's videos, frames, intermediate JSON) are not stored in the repository.
import json, sys, numpy as np, cv2
res = json.load(open(sys.argv[1])); thr = float(sys.argv[2]); t0 = int(sys.argv[3]); t1 = int(sys.argv[4]); step = int(sys.argv[5]); per = int(sys.argv[6]); out = sys.argv[7]
cell = int(sys.argv[8]) if len(sys.argv) > 8 else 8
M = np.array([r['m'] for r in res]); T = len(M)
S = M.copy()
for t in range(T):
    lo, hi = max(0, t - 2), min(T, t + 3); S[t] = np.median(M[lo:hi], axis=0)
B = S < thr
tiles = []
for i in range(t0, min(t1, T), step):
    pic = np.full((20 * cell + 14, 10 * cell + 2, 3), 235, np.uint8)
    for r in range(20):
        for c in range(10):
            if B[i, r, c]: pic[13 + r * cell:13 + r * cell + cell - 1, 1 + c * cell:1 + c * cell + cell - 1] = (40, 40, 40)
    cv2.putText(pic, f'{i}', (1, 10), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (0, 0, 255), 1)
    tiles.append(np.pad(pic, ((0, 0), (0, 4), (0, 0)), constant_values=255))
rows = []
for k in range(0, len(tiles), per):
    row = tiles[k:k + per]
    while len(row) < per: row.append(np.full_like(tiles[0], 255))
    rows.append(np.hstack(row))
img = np.vstack(rows); cv2.imwrite(out, img); print(img.shape)
