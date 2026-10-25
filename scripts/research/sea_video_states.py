# Research script for the Sea Battle originals (see docs/brick/sea-battle-originals.md): Check: draws the run-length states of an animation.
# Inputs (the owner's videos, frames, intermediate JSON) are not stored in the repository.
import json, sys, numpy as np, cv2
d = json.load(open(sys.argv[1])); out = sys.argv[2]; per = int(sys.argv[3]); cell = int(sys.argv[4]); r0 = int(sys.argv[5]) if len(sys.argv) > 5 else 0
tiles = []
for s in d:
    rows = s['rows']
    pic = np.full((len(rows) * cell + 14, 10 * cell + 2, 3), 235, np.uint8)
    for r, row in enumerate(rows):
        for c, ch in enumerate(row):
            if ch == '#': pic[13 + r * cell:13 + r * cell + cell - 1, 1 + c * cell:1 + c * cell + cell - 1] = (40, 40, 40)
    cv2.putText(pic, f"{s['from']}+{s['frames']}", (1, 10), cv2.FONT_HERSHEY_SIMPLEX, 0.3, (0, 0, 255), 1)
    tiles.append(np.pad(pic, ((0, 0), (0, 4), (0, 0)), constant_values=255))
rows_img = []
for k in range(0, len(tiles), per):
    row = tiles[k:k + per]
    while len(row) < per: row.append(np.full_like(tiles[0], 255))
    rows_img.append(np.hstack(row))
img = np.vstack(rows_img); cv2.imwrite(out, img); print(img.shape)
