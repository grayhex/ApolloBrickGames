# Research script for the Sea Battle originals (see docs/brick/sea-battle-originals.md): Converts raw per-cell samples into the vignette-normalised ratios (relative to the 95th percentile over time).
# Inputs (the owner's videos, frames, intermediate JSON) are not stored in the repository.
import json, sys
import numpy as np
res = json.load(open(sys.argv[1])); out = sys.argv[2]
B = np.array([r['b'] for r in res], float); T = len(B)
V = np.percentile(B, 95, axis=0); rel0 = B / V
g = np.percentile(rel0.reshape(T, -1), 92, axis=1)
rel = rel0 / g[:, None, None]
PV = np.array([r['pv'] for r in res], float).reshape(T, 4, 4)
Vp = np.percentile(PV, 95, axis=0); relp = PV / Vp / g[:, None, None]
comb = np.ones((T, 24, 10)); comb[:, :20, :] = rel; comb[:, 20:, :4] = relp
json.dump([{'i': r['i'], 'cc': r['cc'], 'm': np.round(comb[k], 3).tolist()} for k, r in enumerate(res)], open(out, 'w'))
print(T, 'frames; preview rel pctl', np.percentile(relp, [1, 10, 50, 90, 99]).round(2))
