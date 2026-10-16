"""
Сборка лицевой стороны блистерной карточки Crocodile Mario из фото владельца (tools/pack-mario/source/blister-front.webp).

    python3 tools/pack-mario/build.py

Делает: 1) выпрямляет карточку по четырём углам в 660 × 1053 (размер оборота); 2) вырезает по цвету раскрытую жёлтую игрушку в блистере, делит
её по линии шарнира на крышку и основание, сохраняет вырезки с прозрачным фоном; 3) закрашивает на карточке место игрушки (она стоит над картоном
отдельной моделью, под ней картон сглажен); 4) вырезает отверстие для подвеса; 5) пишет контуры (для боковых стенок) в src/app/packOutline.ts
и контур блистера в bubble.svg. Нужны numpy, opencv-python, Pillow.
"""
import json
import pathlib

import cv2
import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[2]
SRC = ROOT / 'tools/pack-mario/source/blister-front.webp'
OUT = ROOT / 'public/brand/pack-mario'
TS = ROOT / 'src/app/packOutline.ts'
W, H = 660, 1053
CX, CY = W / 2, H / 2

# Четыре угла бумаги на фото (по прямым кромок): верх-лево, верх-право, низ-право, низ-лево.
CORNERS = [(145.4, 91.2), (1000.4, 78.8), (1007.1, 1554.9), (164.2, 1566.1)]
# Грубый многоугольник вокруг игрушки: отсекает жёлтое вокруг (заголовок, подписи).
ROI = [(40, 300), (70, 280), (330, 205), (345, 225), (392, 330), (414, 400), (420, 450), (424, 498), (446, 515), (520, 690), (566, 800), (582, 880),
       (580, 905), (560, 930), (520, 942), (480, 957), (420, 974), (330, 984), (300, 985), (250, 950), (222, 830), (150, 560), (40, 330)]
# Линия шарнира: левая и правая точки. Крышка — выше линии, основание — ниже.
HINGE = ((165, 552), (425, 482))
BUBBLE_MARGIN = 22


def warp(im):
    m = cv2.getPerspectiveTransform(np.float32(CORNERS), np.float32([[0, 0], [W - 1, 0], [W - 1, H - 1], [0, H - 1]]))
    return cv2.warpPerspective(im, m, (W, H), flags=cv2.INTER_CUBIC)


def toy_mask(rect):
    hsv = cv2.cvtColor(rect, cv2.COLOR_BGR2HSV)
    hue, sat, val = hsv[:, :, 0], hsv[:, :, 1], hsv[:, :, 2]
    yellow = ((hue >= 18) & (hue <= 38) & (sat > 110) & (val > 140)).astype(np.uint8) * 255
    roi = np.zeros_like(yellow)
    cv2.fillPoly(roi, [np.array(ROI, np.int32)], 255)
    mask = cv2.bitwise_and(yellow, roi)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (31, 31)))
    flood = mask.copy()
    cv2.floodFill(flood, np.zeros((H + 2, W + 2), np.uint8), (0, 0), 255)
    mask |= cv2.bitwise_not(flood)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask)
    biggest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    mask = (labels == biggest).astype(np.uint8) * 255
    return cv2.morphologyEx(mask, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11)))


def split_hinge(mask):
    (ax, ay), (bx, by) = HINGE
    ys, xs = np.mgrid[0:H, 0:W]
    side = (xs - ax) * (by - ay) - (ys - ay) * (bx - ax)
    lid = np.where(side > 0, mask, 0).astype(np.uint8)
    base = np.where(side <= 0, mask, 0).astype(np.uint8)
    return lid, base


def polygon(mask, epsilon):
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    contour = max(contours, key=cv2.contourArea)
    pts = cv2.approxPolyDP(contour, epsilon, True).reshape(-1, 2)
    return [[round(float(x) - CX, 1), round(float(y) - CY, 1)] for x, y in pts]


def cutout(rect, mask, name):
    ys, xs = np.nonzero(mask)
    x0, x1, y0, y1 = max(xs.min() - 3, 0), min(xs.max() + 4, W), max(ys.min() - 3, 0), min(ys.max() + 4, H)
    # Плавная кромка: маска в тройном разрешении, сглаженная и сжатая обратно.
    big = cv2.resize(mask[y0:y1, x0:x1], None, fx=3, fy=3, interpolation=cv2.INTER_NEAREST)
    big = cv2.GaussianBlur(big, (0, 0), 2.2)
    alpha = cv2.resize(big, (x1 - x0, y1 - y0), interpolation=cv2.INTER_AREA)
    rgba = np.dstack([cv2.cvtColor(rect[y0:y1, x0:x1], cv2.COLOR_BGR2RGB), alpha])
    Image.fromarray(rgba, 'RGBA').save(OUT / name, 'WEBP', quality=90, method=6)
    return {'x': int(x0), 'y': int(y0), 'w': int(x1 - x0), 'h': int(y1 - y0)}


def fill_card(rect, mask):
    """Закрашивает место игрушки сглаженным цветом картона вокруг (нормированная свёртка в нескольких масштабах), добавляя зерно."""
    grow = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (23, 23)))
    weight = (grow == 0).astype(np.float32)
    # Подпись «ТЕХНОЛОГИЯ» и штрихкод внизу не должны растекаться по картону: их вес в свёртке занижен.
    weight[955:, :] = 0.0
    src = rect.astype(np.float32)
    filled = np.zeros_like(src)
    done = np.zeros((H, W), np.float32)
    for sigma in (24, 56, 130):
        num = cv2.GaussianBlur(src * weight[:, :, None], (0, 0), sigma)
        den = cv2.GaussianBlur(weight, (0, 0), sigma)[:, :, None]
        est = num / np.maximum(den, 1e-6)
        ok = np.clip((den[:, :, 0] - 0.04) / 0.08, 0, 1) * (1 - done)
        filled += est * ok[:, :, None]
        done += ok
    filled += est * (1 - done)[:, :, None]
    rng = np.random.default_rng(7)
    filled = np.clip(filled + rng.normal(0, 2.5, (H, W, 1)), 0, 255)
    soft = cv2.GaussianBlur(grow, (0, 0), 6).astype(np.float32)[:, :, None] / 255
    return np.clip(src * (1 - soft) + filled * soft, 0, 255).astype(np.uint8)


def hole_mask(rect):
    """Отверстие для подвеса: тёмно-синеватое пятно у верхней кромки (за ним виден серый фон)."""
    x0, x1, y0, y1 = 235, 430, 10, 90
    roi = rect[y0:y1, x0:x1].astype(np.int32)
    blue = ((roi[:, :, 0] - roi[:, :, 2]) > 4).astype(np.uint8) * 255
    blue = cv2.morphologyEx(blue, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    count, labels, stats, _ = cv2.connectedComponentsWithStats(blue)
    biggest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    hole = (labels == biggest).astype(np.uint8) * 255
    hole = cv2.dilate(hole, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    full = np.zeros((H, W), np.uint8)
    full[y0:y1, x0:x1] = hole
    return full


def card_alpha(rect):
    radius = 24
    shape = np.zeros((H * 3, W * 3), np.uint8)
    cv2.rectangle(shape, (radius * 3, 0), (W * 3 - radius * 3, H * 3), 255, -1)
    cv2.rectangle(shape, (0, radius * 3), (W * 3, H * 3 - radius * 3), 255, -1)
    for cx, cy in [(radius, radius), (W - radius, radius), (radius, H - radius), (W - radius, H - radius)]:
        cv2.circle(shape, (cx * 3, cy * 3), radius * 3, 255, -1)
    hole = cv2.resize(hole_mask(rect), (W * 3, H * 3), interpolation=cv2.INTER_NEAREST)
    shape[hole > 0] = 0
    shape = cv2.GaussianBlur(shape, (0, 0), 2.0)
    return cv2.resize(shape, (W, H), interpolation=cv2.INTER_AREA)


def bubble_svg(points, box):
    d = 'M' + ' L'.join(f'{x - box[0]:.1f},{y - box[1]:.1f}' for x, y in points) + ' Z'
    w, h = box[2] - box[0], box[3] - box[1]
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.0f} {h:.0f}" width="{w:.0f}" height="{h:.0f}">'
        '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
        '<stop offset="0" stop-color="#fff" stop-opacity=".30"/><stop offset=".35" stop-color="#fff" stop-opacity=".04"/>'
        '<stop offset=".62" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".14"/></linearGradient></defs>'
        f'<path d="{d}" fill="url(#g)" stroke="#fff" stroke-opacity=".5" stroke-width="2" stroke-linejoin="round"/></svg>\n'
    )


def main():
    photo = cv2.imread(str(SRC))
    rect = warp(photo)
    mask = toy_mask(rect)
    lid, base = split_hinge(mask)
    OUT.mkdir(parents=True, exist_ok=True)
    lid_box = cutout(rect, lid, 'toy-lid.webp')
    base_box = cutout(rect, base, 'toy-base.webp')
    card = fill_card(rect, mask)
    alpha = card_alpha(rect)
    rgba = np.dstack([cv2.cvtColor(card, cv2.COLOR_BGR2RGB), alpha])
    Image.fromarray(rgba, 'RGBA').save(OUT / 'front.webp', 'WEBP', quality=88, method=6)

    outlines = {'lid': polygon(lid, 3.5), 'base': polygon(base, 3.5)}
    bubble_mask = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (BUBBLE_MARGIN * 2 + 1, BUBBLE_MARGIN * 2 + 1)))
    bubble_mask = cv2.GaussianBlur(bubble_mask, (0, 0), 6)
    bubble_mask = (bubble_mask > 127).astype(np.uint8) * 255
    outlines['bubble'] = polygon(bubble_mask, 5.0)
    xs = [p[0] for p in outlines['bubble']]
    ys = [p[1] for p in outlines['bubble']]
    bbox = (min(xs) - 2, min(ys) - 2, max(xs) + 2, max(ys) + 2)
    (OUT / 'bubble.svg').write_text(bubble_svg(outlines['bubble'], bbox), encoding='utf-8')

    boxes = {'lid': lid_box, 'base': base_box, 'bubble': {'x': round(bbox[0] + CX), 'y': round(bbox[1] + CY), 'w': round(bbox[2] - bbox[0]), 'h': round(bbox[3] - bbox[1])}}
    lines = [
        '/**',
        ' * Контуры игрушки и блистера Crocodile Mario на карточке: точки в условных пикселях сцены (начало — центр карточки, x вправо, y вниз).',
        ' * Сгенерировано `tools/pack-mario/build.py` по фото упаковки — вручную не править: перезапустить скрипт.',
        ' * `box` — прямоугольник картинки в координатах карточки (левый верхний угол и размер).',
        ' */',
        "export type OutlinePoint = readonly [number, number];",
        '',
        'export interface OutlinePart {',
        '  points: readonly OutlinePoint[];',
        '  box: { x: number; y: number; w: number; h: number };',
        '}',
        '',
        'export const MARIO_OUTLINES: Readonly<Record<\'lid\' | \'base\' | \'bubble\', OutlinePart>> = {',
    ]
    for key in ('lid', 'base', 'bubble'):
        pts = ', '.join(f'[{x}, {y}]' for x, y in outlines[key])
        b = boxes[key]
        lines.append(f"  {key}: {{ points: [{pts}], box: {{ x: {b['x']}, y: {b['y']}, w: {b['w']}, h: {b['h']} }} }},")
    lines.append('};')
    TS.write_text('\n'.join(lines) + '\n', encoding='utf-8')
    print({k: len(v) for k, v in outlines.items()}, boxes)


if __name__ == '__main__':
    main()
