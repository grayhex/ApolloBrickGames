"""Ноты записи: основной тон по кадрам STFT (сумма гармоник) и сегменты «нота — длительность».

Запуск: python3 audio_notes.py audio44.wav от_с до_с
Печатает: начало–конец, длительность, нота (полутоны от 762 Гц: C = 762 Гц, лад равномерно-темперированный).
Минус «-» — тишина или шум. Трекер даёт самый низкий голос; аккорд «до + ми» показывается как C.
Точность по времени ≈ 5 мс (шаг 221 отсчёт); в стрельбе и шумах основной тон не определяется — это шум, не ошибка.
"""
import sys
import wave

import numpy as np
from scipy import signal

ROOT_HZ = 762.0
NAMES = {-4: 'F#-', -3: 'A', -2: 'A#', -1: 'B', 0: 'C', 1: 'C#', 2: 'D', 3: 'D#', 4: 'E', 5: 'F', 6: 'F#', 7: 'G', 8: 'G#', 9: 'a', 10: 'a#', 11: 'b', 12: 'c', 13: 'c#', 14: 'd'}

w = wave.open(sys.argv[1])
rate = w.getframerate()
x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
t0, t1 = float(sys.argv[2]), float(sys.argv[3])

nper, hop, nfft = 1024, 221, 8192
f, t, z = signal.stft(x, rate, nperseg=nper, noverlap=nper - hop, nfft=nfft, window='hann', boundary=None, padded=False)
power = np.abs(z)
df = f[1] - f[0]
cands = np.arange(300, 4000, 6.0)
harmonics, weights = [1, 3, 5, 7, 9], [1.0, 0.8, 0.6, 0.45, 0.3]  # прямоугольная волна: нечётные гармоники


def at(col, freqs):
    idx = freqs / df
    i0 = np.floor(idx).astype(int)
    frac = idx - i0
    return col[i0] * (1 - frac) + col[i0 + 1] * frac


segments, prev, start = [], None, None
for k in range(power.shape[1]):
    if t[k] < t0 or t[k] > t1:
        continue
    col = np.log10(power[:, k] + 1e-7)
    col -= np.median(col)
    score = np.zeros(len(cands))
    for h, wt in zip(harmonics, weights):
        freqs = cands * h
        ok = freqs < f[-1] - df * 2
        v = np.zeros(len(cands))
        v[ok] = at(col, freqs[ok])
        score += wt * np.clip(v, 0, None)
    j = int(np.argmax(score))
    level = 20 * np.log10(power[:, k].max() + 1e-9)
    if level < -80 or score[j] / sum(weights) < 0.4:
        name = '-'
    else:
        semis = int(round(12 * np.log2(cands[j] / ROOT_HZ)))
        name = NAMES.get(semis, str(semis))
    if name != prev:
        if prev is not None:
            segments.append((start, t[k], prev))
        prev, start = name, t[k]
if prev is not None:
    segments.append((start, t1, prev))
for a, b, name in segments:
    print('%.3f-%.3f  %.3f  %s' % (a, b, b - a, name))
