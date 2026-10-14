import cv2, numpy as np, sys, json
cap = cv2.VideoCapture('in.mp4')
n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
REF = 15
# LCD inner quad in ref-frame pixels: TL, TR, BR, BL (estimated by eye)
quad = np.float32([[520,124],[927,137],[917,350],[509,325]])
CW, CH = 520, 284
canon = np.float32([[0,0],[CW,0],[CW,CH],[0,CH]])
H_ref2c = cv2.getPerspectiveTransform(quad, canon)

orb = cv2.ORB_create(3000)
bf = cv2.BFMatcher(cv2.NORM_HAMMING)
def feats(g):
    return orb.detectAndCompute(g, None)
def homog(kp1, d1, kp2, d2):
    if d1 is None or d2 is None: return None, 0
    m = bf.knnMatch(d1, d2, k=2)
    good = [a for a,b in (x for x in m if len(x)==2) if a.distance < 0.75*b.distance]
    if len(good) < 12: return None, len(good)
    p1 = np.float32([kp1[g.queryIdx].pt for g in good])
    p2 = np.float32([kp2[g.trainIdx].pt for g in good])
    H, inl = cv2.findHomography(p1, p2, cv2.RANSAC, 3.0)
    if H is None: return None, 0
    return H, int(inl.sum())

frames = []
for i in range(n):
    ok, f = cap.read()
    if not ok: break
    frames.append(f)
print('frames', len(frames))
gray = [cv2.cvtColor(f, cv2.COLOR_BGR2GRAY) for f in frames]
F = [feats(g) for g in gray]
kpR, dR = F[REF]
H_to_ref = [None]*len(frames)   # maps frame i coords -> ref coords
quality = [0]*len(frames)
H_to_ref[REF] = np.eye(3); quality[REF] = 9999
def run(order, step):
    prev = REF
    for i in order:
        H, inl = homog(*F[i], kpR, dR)      # direct i -> ref
        if H is not None and inl >= 60:
            H_to_ref[i] = H; quality[i] = inl; prev = i; continue
        Hp, inlp = homog(*F[i], *F[prev])   # i -> prev, chain
        if Hp is not None and inlp >= 40 and H_to_ref[prev] is not None:
            H_to_ref[i] = H_to_ref[prev] @ Hp; quality[i] = -inlp
            prev = i
run(range(REF+1, len(frames)), 1)
run(range(REF-1, -1, -1), -1)
out = np.zeros((len(frames), CH//2, CW//2), np.uint8)
outc = np.zeros((len(frames), CH, CW), np.uint8)
for i in range(len(frames)):
    if H_to_ref[i] is None: continue
    H = H_ref2c @ H_to_ref[i]
    w = cv2.warpPerspective(gray[i], H, (CW, CH), flags=cv2.INTER_AREA)
    outc[i] = w
    out[i] = cv2.resize(w, (CW//2, CH//2), interpolation=cv2.INTER_AREA)
np.save('lcd_small.npy', out); np.save('lcd_full.npy', outc)
json.dump({'quality': quality, 'H': [None if h is None else h.tolist() for h in H_to_ref]}, open('stab.json','w'))
print('ok count', sum(q != 0 for q in quality), 'direct', sum(q >= 60 for q in quality), 'chain', sum(q < 0 for q in quality), 'failed', [i for i,q in enumerate(quality) if q == 0][:50])
