"""
Сборка лицевой стороны коробки Crocodile Mario из фото владельца (tools/pack-mario/source/blister-front.webp — карточка с игрушкой в блистере).

    python3 tools/pack-mario/build.py

Делает: 1) выпрямляет карточку по четырём углам в 660 × 1053 (размер оборота `back.webp`, его скрипт не трогает); 2) отступает от кромки на несколько пикселей,
чтобы в лицо не попал фон и скруглённые углы карточки; 3) закрашивает отверстие для подвеса сглаженным цветом картона вокруг; 4) записывает
`public/brand/pack-mario/front.webp` — сплошной прямоугольник без прозрачности. Игрушка в блистере остаётся на картинке как есть (это «присланная графика»).
Нужны numpy, opencv-python, Pillow.
"""
import pathlib

import cv2
import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[2]
SRC = ROOT / 'tools/pack-mario/source/blister-front.webp'
OUT = ROOT / 'public/brand/pack-mario'
W, H = 660, 1053
# Отступ от кромки карточки (в выпрямленных пикселях): больше радиуса скругления по диагонали (≈ 17 при радиусе 24), чтобы углы были картонными.
INSET = 14

# Четыре угла бумаги на фото (по прямым кромок): верх-лево, верх-право, низ-право, низ-лево.
CORNERS = [(145.4, 91.2), (1000.4, 78.8), (1007.1, 1554.9), (164.2, 1566.1)]


def warp(im):
    m = cv2.getPerspectiveTransform(np.float32(CORNERS), np.float32([[0, 0], [W - 1, 0], [W - 1, H - 1], [0, H - 1]]))
    return cv2.warpPerspective(im, m, (W, H), flags=cv2.INTER_CUBIC)


def hole_mask(rect):
    """Отверстие для подвеса: тёмное пятно (серый фон за картоном) у верхней кромки; картон вокруг светлый."""
    x0, x1, y0, y1 = 240, 420, 6, 88
    roi = rect[y0:y1, x0:x1].astype(np.int32)
    dark = (roi.mean(axis=2) < 150).astype(np.uint8) * 255
    dark = cv2.morphologyEx(dark, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    count, labels, stats, _ = cv2.connectedComponentsWithStats(dark)
    biggest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    hole = (labels == biggest).astype(np.uint8) * 255
    hole = cv2.dilate(hole, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (13, 13)))
    full = np.zeros((H, W), np.uint8)
    full[y0:y1, x0:x1] = hole
    return full


def fill_card(rect, mask):
    """Закрашивает место под маской сглаженным цветом картона вокруг (нормированная свёртка в нескольких масштабах), добавляя зерно."""
    weight = (cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))) == 0).astype(np.float32)
    src = rect.astype(np.float32)
    filled = np.zeros_like(src)
    done = np.zeros((H, W), np.float32)
    for sigma in (6, 16, 40):
        num = cv2.GaussianBlur(src * weight[:, :, None], (0, 0), sigma)
        den = cv2.GaussianBlur(weight, (0, 0), sigma)[:, :, None]
        est = num / np.maximum(den, 1e-6)
        ok = np.clip((den[:, :, 0] - 0.04) / 0.08, 0, 1) * (1 - done)
        filled += est * ok[:, :, None]
        done += ok
    filled += est * (1 - done)[:, :, None]
    rng = np.random.default_rng(7)
    filled = np.clip(filled + rng.normal(0, 2.5, (H, W, 1)), 0, 255)
    soft = cv2.GaussianBlur(cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))), (0, 0), 3).astype(np.float32)[:, :, None] / 255
    return np.clip(src * (1 - soft) + filled * soft, 0, 255).astype(np.uint8)


def main():
    photo = cv2.imread(str(SRC))
    rect = warp(photo)
    rect = fill_card(rect, hole_mask(rect))
    face = cv2.resize(rect[INSET : H - INSET, INSET : W - INSET], (W, H), interpolation=cv2.INTER_CUBIC)
    OUT.mkdir(parents=True, exist_ok=True)
    Image.fromarray(cv2.cvtColor(face, cv2.COLOR_BGR2RGB)).save(OUT / 'front.webp', 'WEBP', quality=88, method=6)
    # Средний цвет картона по краям лица — для боковых граней коробки (src/styles.css, `--box-paper`).
    edge = np.concatenate([face[:30].reshape(-1, 3), face[-30:].reshape(-1, 3), face[:, :30].reshape(-1, 3), face[:, -30:].reshape(-1, 3)])
    b, g, r = (int(v) for v in np.median(edge, axis=0))
    print(f'front.webp {W}x{H}; цвет краёв #{r:02x}{g:02x}{b:02x}')


if __name__ == '__main__':
    main()
