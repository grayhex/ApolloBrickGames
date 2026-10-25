# Research script for the Sea Battle originals (see docs/brick/sea-battle-originals.md): Lattice homography from detected cell blobs (fallback when template matching is not possible).
# Inputs (the owner's videos, frames, intermediate JSON) are not stored in the repository.
"""Fit a lattice homography from detected cell blobs in a reference frame given an approximate uniform lattice.
usage: homog_auto.py frame.png x0 y0 px py out.json [thr]"""
import sys, json
import numpy as np, cv2
from PIL import Image
from scipy import ndimage as ndi
path = sys.argv[1]; x0, y0, px, py = map(float, sys.argv[2:6]); out = sys.argv[6]
thr = float(sys.argv[7]) if len(sys.argv) > 7 else 0.68
a = np.asarray(Image.open(path).convert('L')).astype(float)
bg = ndi.uniform_filter(a, 91)
mask = a < bg * thr
lab, n = ndi.label(mask)
cells = []
for i, sl in enumerate(ndi.find_objects(lab), 1):
    h = sl[0].stop - sl[0].start; w = sl[1].stop - sl[1].start
    area = (lab[sl] == i).sum()
    if 0.35 * px < w < 1.05 * px and 0.35 * py < h < 1.05 * py and area > 0.18 * px * py:
        cy, cx = ndi.center_of_mass(lab == i)
        cells.append((cx, cy))
src, dst = [], []
for cx, cy in cells:
    c = (cx - x0) / px; r = (cy - y0) / py
    ci, ri = round(c), round(r)
    if 0 <= ci < 10 and 0 <= ri < 20 and abs(c - ci) < 0.3 and abs(r - ri) < 0.3:
        src.append((ci, ri)); dst.append((cx, cy))
print(len(cells), 'blobs;', len(src), 'matched')
src = np.array(src, np.float32); dst = np.array(dst, np.float32)
H, inl = cv2.findHomography(src, dst, cv2.RANSAC, 3.0)
pred = cv2.perspectiveTransform(src.reshape(-1, 1, 2), H).reshape(-1, 2)
err = np.linalg.norm(pred - dst, axis=1)
print('inliers', int(inl.sum()), 'max err', err[inl.ravel() == 1].max().round(2), 'mean', err.mean().round(2))
json.dump(H.tolist(), open(out, 'w'))
for r in (0, 19):
    print(r, [tuple(np.round(cv2.perspectiveTransform(np.array([[[c, r]]], np.float32), H)[0, 0], 1).tolist()) for c in (0, 9)])
