# Research script for the Sea Battle originals (see docs/brick/sea-battle-originals.md): Spectral note transcription of the video audio: STFT peak, parabolic interpolation, snap to the device tuning (+12 cents), 3rd-harmonic folding above 1500 Hz.
# Inputs (the owner's videos, frames, intermediate JSON) are not stored in the repository.
import sys, wave, json
import numpy as np
w = wave.open(sys.argv[1]); sr = w.getframerate()
x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(float) / 32768
thr = float(sys.argv[2]); out = sys.argv[3]
win = 3072; hop = int(sr * 0.005); nfft = 32768
hann = np.hanning(win); freqs = np.fft.rfftfreq(nfft, 1 / sr)
band = (freqs >= 300) & (freqs <= 3100)
OFFSET_CENTS = 12.0
def snap(f):
    """nearest equal-tempered pitch with the device offset; returns (hz, err_cents)"""
    midi = 69 + 12 * np.log2(f / 440) - OFFSET_CENTS / 100
    m = round(midi)
    return 440 * 2 ** ((m - 69) / 12) * 2 ** (OFFSET_CENTS / 1200), (midi - m) * 100, m
frames = []
for i in range(0, len(x) - win, hop):
    s = np.abs(np.fft.rfft(x[i:i + win] * hann, nfft))
    sb = s * band
    k = int(np.argmax(sb)); med = float(np.median(s[(freqs > 100) & (freqs < 5000)]))
    ratio = float(s[k]) / (med + 1e-9)
    t = i / sr + win / 2 / sr
    if ratio < thr:
        frames.append((t, 0, 0.0, ratio)); continue
    a, b, c = np.log(s[k - 1] + 1e-12), np.log(s[k] + 1e-12), np.log(s[k + 1] + 1e-12)
    f = freqs[k] + 0.5 * (a - c) / (a - 2 * b + c) * (freqs[1] - freqs[0])
    # third-harmonic dominance (buzzer resonance near 2 kHz): fold down when the fundamental is also present
    cand = f
    if f > 1500:
        k3 = int(np.argmin(abs(freqs - f / 3)))
        if s[k3 - 2:k3 + 3].max() > 0.5 * s[k]: cand = f / 3
        elif f > 1800: cand = f / 3
    hz, err, m = snap(cand)
    frames.append((t, m if abs(err) < 30 else -1, cand, ratio))
# segment by midi
notes = []; cur = None
for t, m, f, r in frames:
    if m <= 0:
        if cur: notes.append(cur); cur = None
        continue
    if cur and cur['m'] == m: cur['end'] = t; cur['n'] += 1; cur['fs'].append(f)
    else:
        if cur: notes.append(cur)
        cur = {'m': m, 'start': t, 'end': t, 'n': 1, 'fs': [f]}
if cur: notes.append(cur)
res = [{'start': round(n['start'] - 0.0025, 3), 'end': round(n['end'] + 0.0025, 3), 'midi': int(n['m']), 'hz': round(float(np.median(n['fs'])), 1)} for n in notes if n['n'] >= 3]
json.dump(res, open(out, 'w'))
print(len(res), 'notes')
for n in res: print(f"{n['start']:6.3f}-{n['end']:6.3f} dur={n['end']-n['start']:5.3f} midi={n['midi']} hz={n['hz']}")
