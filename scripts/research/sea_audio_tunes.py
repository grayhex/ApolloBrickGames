# Research script for the Sea Battle originals (see docs/brick/sea-battle-originals.md): the two tunes in src/audio/seaTunes.ts from the owner's clean recordings
# (start.m4a: the intro melody played four times; romeo.m4a: the Romeo and Juliet music, three passes), plus the timing of the intro's noise flashes.
# Usage: python3 sea_audio_tunes.py start.wav romeo.wav   (WAV mono 44.1 kHz made from the m4a with ffmpeg). Inputs are not stored in the repository.
#
# Method: every 5 ms the 560-1450 Hz spectrum is fitted with non-negative least squares by ten Hann-window lobes, one per step of the device scale (E major +12 cents).
# The passes are aligned (offsets below, found by cross-correlating the dominant line) and merged by the MINIMUM level, which drops clicks and falling-piece noise
# that do not coincide in time; at most two voices per frame, ranked by level against each pitch's usual level (the buzzer is 20-25 dB quieter at 665-745 Hz than at 840-885 Hz).
# Short dips of the total level (28-62 ms) are kept as rests between repeats; 40-100 ms "blend" states are split between their neighbours.
# Hand corrections (PATCHES) are the places where the weak E5/E6 lines vanish under the minimum; they were checked against spectrograms.
import json, sys, wave
import numpy as np
from scipy.ndimage import maximum_filter1d, median_filter
from scipy.optimize import nnls

SCALE = np.array([664.8, 703.5, 745.8, 836.8, 885.0, 938.4, 994.5, 1116.2, 1253.0, 1327.0])
# Usual fundamental level of each step on the recordings (1e-4 units): weak steps are ranked against their own level, not the strongest.
USUAL = np.array([3.0, 3.0, 8.0, 52.0, 53.0, 15.0, 12.0, 34.0, 11.0, 1.2]) * 1e-4
SR, WIN, HOP = 44100, 2048, 220
STEP = HOP / SR

TUNES = {
    # name: pass start offsets in the recording (s), melody length (s), hand corrections
    'start': dict(starts=[0.451, 11.7646, 22.6271, 33.1436], span=10.5, end=10.436,
                  patches=[(2.519, 3.198, [(2.519, 2.915, (664.8, 836.8)), (2.915, 3.198, (664.8,))]),
                           (3.876, 4.235, [(3.876, 4.2, (664.8, 836.8)), (4.2, 4.235, (836.8,))]),
                           (6.889, 6.959, [(6.889, 6.959, (703.5,))]),
                           (8.89, 10.436, [(8.89, 9.084, (745.8, 836.8)), (9.084, 9.209, (745.8,)), (9.209, 9.349, (664.8, 745.8)), (9.349, 9.429, (664.8, 836.8)),
                                           (9.429, 9.498, (664.8, 885.0)), (9.498, 9.643, (664.8, 938.4)), (9.643, 9.733, (664.8, 1116.2)), (9.733, 9.858, (664.8, 1253.0)),
                                           (9.858, 9.96, (664.8,)), (9.96, 10.384, (664.8, 1327.0)), (10.384, 10.436, (664.8,))])],
                  skip_rests=(3.472, 3.517, 9.818, 9.952)),
    'romeo': dict(starts=[1.0126, 20.8070, 40.2585], span=19.7, end=19.117,
                  patches=[(1.452, 1.84, [(1.452, 1.84, (664.8, 836.8))])], skip_rests=()),
}

def load(path):
    w = wave.open(path)
    assert w.getframerate() == SR
    return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(float) / 32768

def roll(x):
    """(frames, 10) fundamental levels of the scale steps."""
    hann, nfft = np.hanning(WIN), WIN * 4
    freqs = np.fft.rfftfreq(nfft, 1 / SR); band = (freqs > 560) & (freqs < 1450)
    t = np.arange(WIN) / SR
    lobes = np.array([np.abs(np.fft.rfft(np.sin(2 * np.pi * p * t) * hann, nfft))[band] / (WIN / 2) for p in SCALE]).T
    return np.array([nnls(lobes, np.abs(np.fft.rfft(x[i:i + WIN] * hann, nfft))[band] / (WIN / 2))[0] for i in range(0, len(x) - WIN, HOP)])

def merge(levels, starts, span, mode):
    n = int(span / STEP); stack = np.full((len(starts), n, 10), np.nan)
    for j, s in enumerate(starts):
        seg = levels[int(round(s / STEP)):int(round(s / STEP)) + n]; stack[j, :len(seg)] = seg
    if mode == 'mean': return np.nanmean(stack, axis=0)
    for j in range(len(starts)):  # a note outlasts the alignment error: widen by a 3-frame maximum, then take the minimum
        ok = ~np.isnan(stack[j, :, 0]); stack[j, ok] = maximum_filter1d(stack[j, ok], size=3, axis=0)
    return np.nanmin(stack, axis=0)

def states(m, thr=0.7e-4, rel=0.08, medw=7, minlen=8):
    ratio = m / USUAL; on = np.zeros_like(m, bool)
    for i in range(len(m)):
        for k in np.argsort(-ratio[i])[:2]:
            if m[i, k] >= thr and ratio[i, k] >= rel * ratio[i].max(): on[i, k] = True
    on = np.stack([median_filter(on[:, k].astype(float), size=medw) > 0.5 for k in range(10)], 1)
    keys = [tuple(np.where(r)[0]) for r in on]; segs = []; s = 0
    for i in range(1, len(keys) + 1):
        if i == len(keys) or keys[i] != keys[s]: segs.append([s, i, keys[s]]); s = i
    def same():
        j = 0
        while j < len(segs) - 1:
            if segs[j][2] == segs[j + 1][2]: segs[j][1] = segs[j + 1][1]; segs.pop(j + 1)
            else: j += 1
    same(); changed = True
    while changed:
        changed = False
        for j in range(1, len(segs) - 1):  # a blend of the neighbours' pitches is a transition: split it in the middle
            a, b, k = segs[j]; p, q, s_ = set(segs[j - 1][2]), set(segs[j + 1][2]), set(k)
            if (b - a) <= minlen * 2.6 and s_ and s_ <= (p | q) and (s_ & (p - q)) and (s_ & (q - p)):
                mid = (a + b) // 2; segs[j - 1][1] = mid; segs[j + 1][0] = mid; segs.pop(j); changed = True; break
        if not changed:
            for j, sg in enumerate(segs):
                if sg[1] - sg[0] < minlen and 0 < j < len(segs) - 1:
                    prev, nxt = segs[j - 1], segs[j + 1]
                    if len(set(prev[2]) & set(sg[2])) >= len(set(nxt[2]) & set(sg[2])): prev[1] = sg[1]
                    else: nxt[0] = sg[0]
                    segs.pop(j); changed = True; break
        same()
    return [(a * STEP, b * STEP, tuple(SCALE[i] for i in k)) for a, b, k in segs]

def drop_flickers(segs, weak=(664.8, 703.5, 938.4, 1327.0), shorter=0.1):
    out = [[a, b, tuple(p for p in ps if not (p in weak and b - a < shorter))] for a, b, ps in segs]
    j = 0
    while j < len(out) - 1:
        if out[j][2] == out[j + 1][2]: out[j][1] = out[j + 1][1]; out.pop(j + 1)
        else: j += 1
    return out

def patch(segs, t0, t1, new):
    out = []
    for a, b, ps in segs:
        if b <= t0 or a >= t1: out.append([a, b, ps]); continue
        if a < t0: out.append([a, t0, ps])
        if b > t1: out.append([t1, b, ps])
    return sorted(out + [list(x) for x in new], key=lambda s: s[0])

def rests(levels, starts, span, skip, lo=0.028, hi=0.062):
    total = merge(levels, starts, span + 0.2, 'mean').sum(axis=1)
    low = total < 0.33 * maximum_filter1d(total, size=int(0.3 / STEP)); out = []; s = None
    for i in range(len(low) + 1):
        v = low[i] if i < len(low) else False
        if v and s is None: s = i
        if not v and s is not None:
            if lo <= (i - s) * STEP <= hi and not any(abs(s * STEP - k) < 0.02 for k in skip): out.append((s * STEP, i * STEP))
            s = None
    return out

def cut_rests(segs, cuts):
    """Rests silence both voices: every state is cut by the rests that overlap it."""
    out = []
    for a, b, ps in segs:
        pieces = [(a, b)]
        for ra, rb in cuts:
            nxt = []
            for x, y in pieces:
                if rb <= x or ra >= y: nxt.append((x, y)); continue
                if x < ra: nxt.append((x, ra))
                if y > rb: nxt.append((rb, y))
            pieces = nxt
        out += [[x, y, ps] for x, y in pieces if y - x > 0.012]
    return out

def voices(segs, end):
    """Two voices by continuity (a pitch that goes on keeps its voice), as [Hz, ms] steps quantised to 5 ms with exact cumulative time."""
    cur = [None, None]; tr = [[], []]
    for a, b, ps in segs:
        ps = list(ps); new = [None, None]
        for v in range(2):
            if cur[v] in ps: new[v] = cur[v]; ps.remove(cur[v])
        for p in sorted(ps):
            v = 0 if new[0] is None else 1
            if new[v] is not None: v = 1 - v
            if new[v] is None: new[v] = p
        for v in range(2): tr[v].append((a, b, new[v]))
        cur = new
    out = []
    for track in tr:
        ev, t = [], 0.0
        for a, b, p in track:
            if a > t + 1e-6: ev.append([0.0, a - t])
            ev.append([p or 0.0, b - max(a, t)]); t = b
        if end > t + 1e-6: ev.append([0.0, end - t])
        merged = []
        for p, d in ev:
            if merged and merged[-1][0] == p: merged[-1][1] += d
            else: merged.append([p, d])
        res, acc, q = [], 0.0, 0
        for p, d in merged:
            acc += d; n = int(round(acc * 1000 / 5)) * 5 - q; q += n
            if n > 0: res.append([p, n])
        out.append(res)
    return out

def transcribe(name, wav):
    cfg = TUNES[name]; levels = roll(load(wav))
    segs = drop_flickers([[a, b, tuple(ps)] for a, b, ps in states(merge(levels, cfg['starts'], cfg['span'], 'min'))])
    for t0, t1, new in cfg['patches']: segs = patch(segs, t0, t1, new)
    segs = [s for s in segs if s[0] < cfg['end']]; segs[-1][1] = min(segs[-1][1], cfg['end'])
    cut = cut_rests(segs, rests(levels, cfg['starts'], cfg['span'], cfg['skip_rests']))
    return voices(sorted(cut, key=lambda s: s[0]), cfg['end'])

def bursts(wav, lo=3300, hi=4800, factor=5.0, min_len=0.08):
    """Start times of the broadband noise flashes (median level in 3.3-4.8 kHz above the usual): the intro's shot and explosion, 3.46 s apart, every 13.87 s (the 27.8-28.5 and 35.6-35.8 s hits in start.m4a are taps on the case, not flashes)."""
    x = load(wav); hann = np.hanning(1024); freqs = np.fft.rfftfreq(1024, 1 / SR); band = (freqs > lo) & (freqs < hi)
    level = np.array([np.median(np.abs(np.fft.rfft(x[i:i + 1024] * hann))[band]) for i in range(0, len(x) - 1024, 256)])
    on = level > np.median(level) * factor; t = np.arange(len(level)) * 256 / SR; out = []; i = 0
    while i < len(on):
        if on[i]:
            j = i
            while j < len(on) and (on[j] or on[j:j + 10].any()): j += 1
            if t[j - 1] - t[i] > min_len: out.append(round(float(t[i]), 3))
            i = j
        else: i += 1
    return out

if __name__ == '__main__':
    start_wav, romeo_wav = sys.argv[1], sys.argv[2]
    print(json.dumps({'start': transcribe('start', start_wav), 'romeo': transcribe('romeo', romeo_wav), 'flashes': bursts(start_wav)}))
