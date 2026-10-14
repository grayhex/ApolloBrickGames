"""Светодиоды записи (Video_Project_6.mp4): позиция и яркость каждого по кадрам, временная шкала «горит / не горит».

Запуск: python3 led_chase.py in.mp4 [от_с до_с]
Находит красное, жёлтое и зелёное пятна в верхней части кадра (цветовые пороги HSV), берёт «белизну» окна 9 × 9 px
(у горящего светодиода центр белеет, у погашенного — нет), порог по Оцу отдельно для каждого светодиода и печатает
сжатую шкалу: время, длительность, какие горят (R, Y, G; точки — погашены).
Положения светодиодов берутся из кадров, где пятно найдено; пропуски заполняются по вектору между соседними светодиодами.
Запись смещена: светодиоды опережают звуковую дорожку на ≈ 0,19 с (экран тоже) — это задержка записи, в движке синхронизация нулевая.
"""
import sys

import cv2
import numpy as np

video = sys.argv[1]
lo, hi = (float(sys.argv[2]), float(sys.argv[3])) if len(sys.argv) > 3 else (0.0, 1e9)
TOP = (0, 300, 0, 852)  # y0, y1, x0, x1 — полоса со светодиодами в кадре 852 × 480 (Video_Project_6.mp4)
RULES = {'R': ((0, 8), 90, 150), 'Y': ((18, 34), 80, 150), 'G': ((38, 90), 60, 120)}  # оттенок, мин. насыщенность, мин. яркость


def blob(hsv, hue, smin, vmin):
    h, s, v = cv2.split(hsv)
    m = ((h >= hue[0]) & (h <= hue[1]) & (s >= smin) & (v >= vmin)).astype(np.uint8)
    mask = np.zeros_like(m)
    y0, y1, x0, x1 = TOP
    mask[y0:y1, x0:x1] = 1
    n, _, stats, centers = cv2.connectedComponentsWithStats(m * mask, 8)
    best = None
    for k in range(1, n):
        area = stats[k, cv2.CC_STAT_AREA]
        if 6 <= area <= 900 and (best is None or area > best[0]):
            best = (area, centers[k])
    return None if best is None else np.array(best[1])


cap = cv2.VideoCapture(video)
fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
places = {k: [] for k in RULES}
while True:  # проход 1: положения цветных пятен
    ok, frame = cap.read()
    if not ok:
        break
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    for k, (hue, smin, vmin) in RULES.items():
        place = blob(hsv, hue, smin, vmin)
        if place is None and k == 'R':
            place = blob(hsv, (172, 180), smin, vmin)  # красный переходит через 0 по оттенку
        places[k].append(place)

n = len(places['Y'])


def nearest_vector(a, b, i):
    for d in range(200):
        for j in (i - d, i + d):
            if 0 <= j < n and places[a][j] is not None and places[b][j] is not None:
                return places[b][j] - places[a][j]
    return None


brightness = np.full((n, 3), np.nan)
cap = cv2.VideoCapture(video)
for i in range(n):  # проход 2: «белизна» окна вокруг каждого светодиода (кадры в памяти не копим)
    ok, frame = cap.read()
    yellow = places['Y'][i]
    if not ok or yellow is None:
        continue
    red = places['R'][i]
    if red is None and (v := nearest_vector('R', 'Y', i)) is not None:
        red = yellow - v
    green = places['G'][i]
    if green is None and (v := nearest_vector('Y', 'G', i)) is not None:
        green = yellow + v
    for k, p in enumerate((red, yellow, green)):
        if p is None:
            continue
        x0, y0 = int(round(p[0])), int(round(p[1]))
        patch = frame[max(0, y0 - 4):y0 + 5, max(0, x0 - 4):x0 + 5]
        if patch.size:
            brightness[i, k] = float(patch.min(axis=2).max())  # «белизна»: самый светлый по всем каналам пиксель


def otsu(values):
    values = values[~np.isnan(values)]
    hist, edges = np.histogram(values, bins=64)
    centers = (edges[:-1] + edges[1:]) / 2
    best = None
    for i in range(1, 63):
        w0, w1 = hist[:i].sum(), hist[i:].sum()
        if w0 == 0 or w1 == 0:
            continue
        m0, m1 = (hist[:i] * centers[:i]).sum() / w0, (hist[i:] * centers[i:]).sum() / w1
        score = w0 * w1 * (m0 - m1) ** 2
        if best is None or score > best[0]:
            best = (score, centers[i])
    return best[1]


times = np.arange(n) / fps
window = (times >= lo) & (times <= hi)
limits = [otsu(brightness[window, k]) for k in range(3)]
print('пороги белизны R, Y, G:', [round(float(v)) for v in limits])
prev, start = None, 0
for i in range(n + 1):
    key = None
    if i < n and window[i]:
        key = ''.join(name if not np.isnan(brightness[i, k]) and brightness[i, k] > limits[k] else '.' for k, name in enumerate('RYG'))
    if key != prev:
        if prev is not None:
            print('%.2f %.2f %s' % (start / fps, (i - start) / fps, prev))
        prev, start = key, i
