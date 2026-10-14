"""Клетка-блок LCD по макрофотографиям экрана → `block-gaps.png`.

Использование: python3 extract_block.py photo_03.jpg photo_10.jpg photo_15.jpg photo_12.jpg block-gaps.png
(порядок фиксирован: снимки 22-05-03, 22-05-10, 22-05-15, 22-05-12 из комплекта владельца; сами фото в репозиторий не входят).

Что делает:
  1. Углы групп блоков (2 × 3 и ряд из 5 на снимке 03, группы 2 × 2 на 10 и 15, столбец из 3 на 12) заданы вручную по снимкам
     (сначала автопоиск по тёмно-синим пикселям, затем правка по контуру), по ним строится гомография в сетку клеток.
  2. Каждая клетка уточняется относительно усреднённой (ECC, гомография) — 4–5 прогонов, плохо совпавшие (< 0,8) отбрасываются.
  3. Среднее обрезается по тёмному прямоугольнику клетки, растягивается до 120 × 104 (в 4 раза крупнее) и бинаризуется.
Результат — белое там, где свет (зазоры между сегментами), чёрное там, где сегменты тёмные.
"""
import sys

import cv2
import numpy as np

S = 2
CW, CH = 128 * S, 112 * S
M = 4 * S
P = 24
SS = 4  # масштаб итоговой маски относительно клетки 128 × 112

# Группа: (индекс снимка, четыре угла (лево-верх, право-верх, право-низ, лево-низ), столбцов, строк, вес, пропустить клетки)
GROUPS = [
    (0, [[708, 151], [909, 115], [937, 355], [747, 398]], 2, 3, 1.0, {5}),
    (0, [[434, 551], [976, 465], [987, 544], [440, 630]], 5, 1, 1.0, set()),
    (1, [[843, 166], [1000, 141], [1030, 260], [867, 280]], 2, 2, 0.5, set()),
    (2, [[847, 161], [1004, 138], [1034, 256], [868, 267]], 2, 2, 0.5, set()),
    (3, [[1002, 150], [1076, 140], [1134, 326], [1052, 335]], 1, 3, 0.5, set()),
]
# Тёмный прямоугольник усреднённой клетки в координатах рабочего холста (измерено по профилям яркости).
RECT = (24.0, 262.0, 23.5, 227.5)


def cell_homographies(quad, cols, rows):
    gw, gh = (cols * 128 - 8) * S, (rows * 112 - 8) * S
    dst = np.array([[0, 0], [gw, 0], [gw, gh], [0, gh]], np.float32) + M
    h = cv2.getPerspectiveTransform(np.array(quad, np.float32), dst)
    result = []
    for r in range(rows):
        for c in range(cols):
            t = np.array([[1, 0, -c * CW + P], [0, 1, -r * CH + P], [0, 0, 1]], np.float64)
            result.append(t @ h)
    return result


def warp(img, h):
    return cv2.warpPerspective(img, h, (CW + 2 * P, CH + 2 * P), flags=cv2.INTER_CUBIC, borderValue=(0, 0, 0))


def prepare(cell):
    g = cv2.GaussianBlur(cv2.cvtColor(cell, cv2.COLOR_BGR2GRAY).astype(np.float32), (0, 0), 1.5)
    inner = g[P:-P, P:-P]
    lo, hi = np.percentile(inner, 4), np.percentile(inner, 96)
    return np.clip((g - lo) / (hi - lo + 1e-3), 0, 1.3)


def main(photos, out):
    imgs = [cv2.imread(p) for p in photos]
    sources = []
    for index, quad, cols, rows, weight, skip in GROUPS:
        for k, h in enumerate(cell_homographies(quad, cols, rows)):
            if k not in skip:
                sources.append((imgs[index], h, weight))
    mask = np.zeros((CH + 2 * P, CW + 2 * P), np.uint8)
    mask[P : P + CH, P : P + CW] = 255
    cells = [warp(img, h) for img, h, _ in sources]
    ref = prepare(cells[0])
    for _ in range(5):
        aligned = []
        for cell, (_, _, weight) in zip(cells, sources):
            w = np.eye(3, dtype=np.float32)
            try:
                cc, w = cv2.findTransformECC(ref, prepare(cell), w, cv2.MOTION_HOMOGRAPHY, (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 300, 1e-7), mask, 7)
            except cv2.error:
                cc = 0
            if cc < 0.8:
                continue
            al = cv2.warpPerspective(cell, w, (CW + 2 * P, CH + 2 * P), flags=cv2.INTER_CUBIC + cv2.WARP_INVERSE_MAP)
            aligned.append((prepare(al), weight))
        ref = np.clip(sum(g * w for g, w in aligned) / sum(w for _, w in aligned), 0, 1.3)
    print(f'клеток в среднем: {len(aligned)}')
    x0, x1, y0, y1 = RECT
    w, h = 120 * SS, 104 * SS
    affine = cv2.getAffineTransform(np.array([[x0, y0], [x1, y0], [x1, y1]], np.float32), np.array([[0, 0], [w, 0], [w, h]], np.float32))
    big = cv2.warpAffine(ref.astype(np.float32), affine, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    big = cv2.GaussianBlur(big, (0, 0), SS * 0.45)
    cv2.imwrite(out, (big > 0.5).astype(np.uint8) * 255)


if __name__ == '__main__':
    if len(sys.argv) != 6:
        sys.exit(__doc__)
    main(sys.argv[1:5], sys.argv[5])
