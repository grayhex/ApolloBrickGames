# Research script for the Sea Battle originals (see docs/brick/sea-battle-originals.md): Samples the 10x20 LCD of a hand-held video: ECC alignment to a reference frame, homography lattice, per-cell brightness (ratio to the vignette-normalised background).
# Inputs (the owner's videos, frames, intermediate JSON) are not stored in the repository.
"""Aligns each video frame to a reference frame (coarse-to-fine ECC on the static bezel/divider/LCD border), then samples the 10x20 LCD grid.
usage: align_sample.py video ref_frame_index out.json x0 y0 px py [--save-dir DIR] [--tmax N] [--tmin N]"""
import sys, json, subprocess
import numpy as np, cv2
video, ref_idx, out = sys.argv[1], int(sys.argv[2]), sys.argv[3]
Hm = np.array(json.load(open(sys.argv[4])), np.float64)
x0, y0 = float(Hm[0,2]), float(Hm[1,2]); px = float(np.hypot(Hm[0,0], Hm[1,0])); py = float(np.hypot(Hm[0,1], Hm[1,1]))
PATCH = int(sys.argv[5])
args = sys.argv[6:]
PV0 = (434.5, 450.5); PVP = (26.5, 26.3)
if '--pv' in args:
    _v = [float(t) for t in args[args.index('--pv') + 1:args.index('--pv') + 5]]; PV0 = (_v[0], _v[1]); PVP = (_v[2], _v[3])
save = args[args.index('--save-dir') + 1] if '--save-dir' in args else None
tmax = int(args[args.index('--tmax') + 1]) if '--tmax' in args else None
tmin = int(args[args.index('--tmin') + 1]) if '--tmin' in args else 0
W, H = 720, 1280
def frames():
    p = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', video, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], stdout=subprocess.PIPE)
    while True:
        buf = p.stdout.read(W * H)
        if len(buf) < W * H: return
        yield np.frombuffer(buf, dtype=np.uint8).reshape(H, W)
allf = []
for i, f in enumerate(frames()):
    if tmax and i >= tmax: break
    allf.append(f.copy())
def prep(a, blur):
    b = cv2.GaussianBlur(a.astype(np.float32), (0, 0), blur)
    gx = cv2.Sobel(b, cv2.CV_32F, 1, 0); gy = cv2.Sobel(b, cv2.CV_32F, 0, 1)
    return cv2.magnitude(gx, gy)
mask = np.zeros((H, W), np.uint8)
mask[100:1020, 0:700] = 255
mask[int(y0 - 0.5 * py + 22):int(y0 + 19.5 * py - 22), int(x0 - 0.5 * px + 22):int(x0 + 9.5 * px - 22)] = 0
S = 4
ref = allf[ref_idx]
ref_c = prep(cv2.resize(ref, (W // S, H // S), interpolation=cv2.INTER_AREA), 1.5)
ref_f = prep(ref, 2.0)
mask_c = cv2.resize(mask, (W // S, H // S), interpolation=cv2.INTER_NEAREST)
crit_c = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 100, 1e-6)
crit_f = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 80, 1e-6)
res = []; ccs = []; prev_w = None
for i, f in enumerate(allf):
    if i < tmin:
        continue
    fc = prep(cv2.resize(f, (W // S, H // S), interpolation=cv2.INTER_AREA), 1.5)
    best = None
    inits = []
    if prev_w is not None:
        inits.append(prev_w.copy())
    for k, init in enumerate(inits):
        try:
            cc, w = cv2.findTransformECC(ref_c, fc, init, cv2.MOTION_AFFINE, crit_c, mask_c, 5)
            best = (cc, w.copy())
        except cv2.error:
            pass
    if best is None or best[0] < 0.93:
        for sc in (0.88, 0.94, 1.0, 1.06):
            for dx0 in (-8, 0, 8):
                for dy0 in (-8, 0, 8):
                    cx0, cy0 = W / S / 2, H / S / 2
                    w = np.array([[sc, 0, dx0 + cx0 * (1 - sc)], [0, sc, dy0 + cy0 * (1 - sc)]], np.float32)
                    try:
                        cc, w = cv2.findTransformECC(ref_c, fc, w, cv2.MOTION_AFFINE, crit_c, mask_c, 5)
                    except cv2.error:
                        continue
                    if best is None or cc > best[0]: best = (cc, w.copy())
    if best is None:
        w = np.eye(2, 3, dtype=np.float32); cc0 = 0
    else:
        cc0, w = best
    prev_w = w.copy()
    wf = w.copy(); wf[:, 2] *= S
    g = prep(f, 2.0)
    try:
        cc, wf = cv2.findTransformECC(ref_f, g, wf, cv2.MOTION_AFFINE, crit_f, mask, 5)
    except cv2.error:
        cc = cc0
    aligned = cv2.warpAffine(f, wf, (W, H), flags=cv2.INTER_LINEAR + cv2.WARP_INVERSE_MAP).astype(float)
    m = np.zeros((20, 10)); m2 = np.zeros((20, 10))
    def pt(c, r):
        v = Hm @ np.array([c, r, 1.0]); return v[0] / v[2], v[1] / v[2]
    for r in range(20):
        for c in range(10):
            cx, cy = pt(c, r)
            ctr = aligned[int(cy - PATCH + 1):int(cy + PATCH), int(cx - PATCH + 1):int(cx + PATCH)].mean()
            rs = []
            for k in range(8):
                ang = k * np.pi / 4
                rx, ry = cx + 0.36 * px * np.cos(ang), cy + 0.36 * py * np.sin(ang)
                rs.append(aligned[int(ry - 1):int(ry + 2), int(rx - 1):int(rx + 2)].mean())
            m[r, c] = ctr / max(1.0, float(np.mean(rs)))
            m2[r, c] = ctr
    pv = []
    for pr in range(4):
        for pc in range(4):
            qx, qy = PV0[0] + PVP[0] * pc, PV0[1] + PVP[1] * pr
            pv.append(int(round(aligned[int(qy - 4):int(qy + 5), int(qx - 4):int(qx + 5)].mean())))
    res.append({'pv': pv, 'i': i, 'cc': round(float(cc), 3), 'm': np.round(m, 3).tolist(), 'b': np.round(m2).astype(int).tolist()})
    if save and i % 10 == 0:
        crop = aligned[int(y0 - 40):int(y0 + 20 * py), int(x0 - 40):int(x0 + 10 * px)].astype(np.uint8)
        cv2.imwrite(f'{save}/a_{i:04d}.png', crop)
json.dump(res, open(out, 'w'))
ccv = [r['cc'] for r in res]
print(len(res), 'frames; cc min/median', min(ccv), float(np.median(ccv)))
