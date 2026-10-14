"""Проверка звуковой дорожки и светодиодов по видео (после stabilize.py: нужны in.mp4 и stab.json).

Звук: ffmpeg извлекает дорожку; если RMS нулевой — звука в видео нет.
Светодиоды: позиции в эталонном кадре (REF = 15) переносятся в каждый кадр обратной гомографией,
берётся максимум яркости в окне 11 × 11 px. Значение 255 означает насыщение матрицы камеры.
"""
import json, subprocess, wave
import cv2, numpy as np

LEDS = {'red': (652, 32), 'yellow': (728, 32), 'green': (804, 32)}  # в эталонном кадре 15

subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', 'in.mp4', '-vn', '-ac', '1', '-ar', '16000', 'audio.wav'], check=True)
w = wave.open('audio.wav')
x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
print('аудио: длительность %.2f с, RMS %.4f, пик %.4f' % (len(x) / w.getframerate(), np.sqrt((x ** 2).mean()), np.abs(x).max()))

H = json.load(open('stab.json'))['H']
inv = [None if h is None else np.linalg.inv(np.array(h)) for h in H]
cap = cv2.VideoCapture('in.mp4')
rows, i = [], 0
while True:
    ok, frame = cap.read()
    if not ok:
        break
    row = []
    for x0, y0 in LEDS.values():
        if inv[i] is None:
            row.append(np.nan)
            continue
        p = inv[i] @ np.array([x0, y0, 1.0])
        px, py = int(round(p[0] / p[2])), int(round(p[1] / p[2]))
        if not (8 <= px < frame.shape[1] - 8 and 8 <= py < frame.shape[0] - 8):
            row.append(np.nan)
            continue
        row.append(float(frame[py - 5:py + 6, px - 5:px + 6].max()))
    rows.append(row)
    i += 1
a = np.array(rows)
for k, name in enumerate(LEDS):
    v = a[:600, k]
    print(name, 'кадры 0-599: насыщено (255) в %.1f %% кадров, минимум %.0f' % (100 * (v >= 254).mean(), np.nanmin(v)))
