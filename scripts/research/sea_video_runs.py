# Research script for the Sea Battle originals (see docs/brick/sea-battle-originals.md): Thresholds the ratios, median-filters in time and run-length encodes states into frames; prints the compact hex used by src/brick/data/sea-animations.json.
# Inputs (the owner's videos, frames, intermediate JSON) are not stored in the repository.
"""Turn a ratio JSON into clean run-length frames.
usage: anim_runs.py ratios.json thr r0 r1 minrun tmin tmax out.json"""
import json, sys
import numpy as np
res = json.load(open(sys.argv[1])); thr = float(sys.argv[2]); r0, r1 = int(sys.argv[3]), int(sys.argv[4])
minrun = int(sys.argv[5]); tmin, tmax = int(sys.argv[6]), int(sys.argv[7]); out = sys.argv[8]
keep1 = int(sys.argv[9]) if len(sys.argv) > 9 else -1
M = np.array([r['m'] for r in res])
T = len(M); S = M.copy()
for t in range(T):
    lo, hi = max(0, t - 2), min(T, t + 3); S[t] = np.median(M[lo:hi], axis=0)
B = (S < thr)[:, r0:r1, :]
B[:, :, :] = B
runs = []; s = tmin
for t in range(tmin + 1, tmax + 1):
    if t == tmax or (B[t] != B[s]).any():
        runs.append([s, t - 1]); s = t
# merge short runs into the previous one
merged = []
for a, z in runs:
    if merged and z - a + 1 < minrun and a >= keep1:
        merged[-1][1] = z
    else:
        merged.append([a, z])
# merge equal neighbours
final = []
for a, z in merged:
    if final and (B[final[-1][0]] == B[a]).all(): final[-1][1] = z
    else: final.append([a, z])
data = []
for a, z in final:
    rows = [''.join('#' if v else '.' for v in B[a, r]) for r in range(r1 - r0)]
    data.append({'from': a, 'to': z, 'frames': z - a + 1, 'rows': rows})
json.dump(data, open(out, 'w'))
print(len(data), 'states')
for d in data: print(d['from'], d['to'], d['frames'])
