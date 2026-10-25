# Research script for the Sea Battle originals (see docs/brick/sea-battle-originals.md): Lit-cell centres by template matching and RANSAC homography fit of the lattice.
# Inputs (the owner's videos, frames, intermediate JSON) are not stored in the repository.
"""Find lit-cell centres by template matching on a reference frame and fit the lattice homography.
usage: lattice_tm.py frame.png tx ty tw th px0 py0 out.json   (template = patch at (tx,ty,tw,th) of an isolated lit cell)"""
import sys, json
import numpy as np, cv2
img = cv2.imread(sys.argv[1], cv2.IMREAD_GRAYSCALE).astype(np.float32)
tx, ty, tw, th = map(int, sys.argv[2:6]); px0, py0 = float(sys.argv[6]), float(sys.argv[7]); out = sys.argv[8]
tpl = img[ty:ty + th, tx:tx + tw]
res = cv2.matchTemplate(img, tpl, cv2.TM_CCOEFF_NORMED)
ys, xs = np.where(res > 0.55)
pts = sorted(zip(res[ys, xs], xs, ys), reverse=True)
kept = []
for sc, x, y in pts:
    if all((x - kx) ** 2 + (y - ky) ** 2 > (0.6 * px0) ** 2 for _, kx, ky in kept):
        kept.append((sc, x, y))
centres = np.array([(x + tw / 2, y + th / 2) for _, x, y in kept])
print(len(centres), 'cells found')
np.save('tm_centres.npy', centres)
# assign lattice indices: bottom-most row = 19, left-most col = 0 (frame has the pile, so rows/cols are populated)
xs = centres[:, 0]; ys = centres[:, 1]
xmin = xs.min(); ymax = ys.max()
cols = np.round((xs - xmin) / px0).astype(int); rows = 19 - np.round((ymax - ys) / py0).astype(int)
ok = (cols >= 0) & (cols < 10) & (rows >= 0) & (rows < 20)
src = np.stack([cols[ok], rows[ok]], 1).astype(np.float32); dst = centres[ok].astype(np.float32)
H, inl = cv2.findHomography(src, dst, cv2.RANSAC, 3.0)
pred = cv2.perspectiveTransform(src.reshape(-1, 1, 2), H).reshape(-1, 2)
err = np.linalg.norm(pred - dst, axis=1)
print('used', int(ok.sum()), 'inliers', int(inl.sum()), 'median err', float(np.median(err)).__round__(2), 'max inlier err', float(err[inl.ravel() == 1].max()).__round__(2))
json.dump(H.tolist(), open(out, 'w'))
for r in (0, 19):
    print(r, [tuple(np.round(cv2.perspectiveTransform(np.array([[[c, r]]], np.float32), H)[0, 0], 1).tolist()) for c in (0, 9)])
