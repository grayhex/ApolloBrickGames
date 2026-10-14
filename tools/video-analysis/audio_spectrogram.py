"""Звук записи (Video_Project_6.mp4): извлечение дорожки и общая спектрограмма.

Запуск: python3 audio_spectrogram.py in.mp4 out_dir
Результат: out_dir/audio44.wav (моно, 44,1 кГц) и out_dir/spectrogram.png (спектрограмма до 6 кГц и громкость).
Нужны ffmpeg, numpy, scipy, matplotlib.
"""
import subprocess
import sys
import wave
from pathlib import Path

import matplotlib
import numpy as np
from scipy import signal

matplotlib.use('Agg')
import matplotlib.pyplot as plt  # noqa: E402

video, out = sys.argv[1], Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
wav = out / 'audio44.wav'
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', video, '-vn', '-ac', '1', '-ar', '44100', str(wav)], check=True)

w = wave.open(str(wav))
rate = w.getframerate()
x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
print('частота %d Гц, длительность %.2f с' % (rate, len(x) / rate))

hop = int(rate * 0.02)
rms = np.array([np.sqrt((x[i:i + hop] ** 2).mean()) for i in range(0, len(x) - hop, hop)])
f, t, spec = signal.spectrogram(x, rate, nperseg=2048, noverlap=1536, window='hann')
low = f < 6000
fig, ax = plt.subplots(2, 1, figsize=(20, 9), sharex=True)
ax[0].pcolormesh(t, f[low], 10 * np.log10(spec[low] + 1e-12), shading='auto', cmap='magma', vmin=-110, vmax=-50)
ax[0].set_ylabel('Гц')
ax[1].plot(np.arange(len(rms)) * 0.02, 20 * np.log10(rms + 1e-6))
ax[1].set_ylabel('RMS, дБ')
ax[1].set_ylim(-90, -20)
ax[1].set_xticks(np.arange(0, len(x) / rate + 2, 2))
ax[1].grid(True, alpha=0.3)
plt.tight_layout()
plt.savefig(out / 'spectrogram.png', dpi=70)
