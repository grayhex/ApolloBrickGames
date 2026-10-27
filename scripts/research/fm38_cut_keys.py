#!/usr/bin/env python3
"""FM-38: вырезать семь кнопок и рамку экрана из графики корпуса, присланной владельцем (`public/devices/fm38/body.png`).

Корпус нарисован целиком, поэтому кнопки в нём — часть картинки. Чтобы они были отдельными объектами (своя форма, свой отклик на нажатие), скрипт:
  1. находит каждую кнопку по цвету (розовые и жёлтые) внутри заданной области вокруг её центра;
  2. сохраняет кнопку как спрайт `public/devices/fm38/keys/<ключ>.png` — исходные пиксели с мягким краем, ничего не перерисовано;
  3. заполняет место кнопки в корпусе окружающим пластиком и сохраняет `public/devices/fm38/body-plain.png` (подписи и надписи не трогаются);
  4. записывает геометрию (`scripts/research/fm38-keys.json`): рамка спрайта в пикселях корпуса и контур для области нажатия;
  5. для вида «только экран» вырезает рамку экрана (синяя полоса с рожицами, фаска и стекло) по её внешнему контуру в `public/devices/fm38/screen-frame.png`
     (за контуром прозрачно, край сглажен) и записывает её размеры и положение окна под экран (`scripts/research/fm38-frame.json`).

Исходный `body.png` не меняется: он нужен миниатюрам (там кнопки видны). Запуск: `python3 scripts/research/fm38_cut_keys.py` из корня репозитория (нужны numpy, opencv-python).
"""
import json
import pathlib

import cv2
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[2]
DEVICE = ROOT / 'public' / 'devices' / 'fm38'
# Центр и примерный размер каждой кнопки в пикселях корпуса (как в прежней вёрстке кнопок).
KEYS = {
    'left': (296, 817, 95, 105),
    'right': (493, 817, 100, 105),
    'down': (394, 943, 110, 100),
    'sp': (666, 787, 100, 90),
    'sound': (650, 885, 90, 85),
    'onoff': (632, 981, 65, 65),
    'jump': (816, 888, 140, 140),
}
ELLIPSE = cv2.MORPH_ELLIPSE


def kernel(size: int) -> np.ndarray:
    return cv2.getStructuringElement(ELLIPSE, (size, size))


def plastic_fill(image: np.ndarray, hole: np.ndarray, skip: np.ndarray) -> np.ndarray:
    """Заполнить `hole` гладкой поверхностью пластика: плоскость яркости (среднее и наклон), подогнанная по узкому кольцу пикселей вокруг дыры (без подписей `skip`)."""
    ys, xs = np.where(hole > 0)
    cx, cy, scale = xs.mean(), ys.mean(), max(np.ptp(xs), np.ptp(ys)) / 2 + 1
    ring = (cv2.dilate(hole, kernel(2 * 22 + 1)) > 0) & (cv2.dilate(hole, kernel(13)) == 0) & (skip == 0)
    ry, rx = np.where(ring)

    def basis(x: np.ndarray, y: np.ndarray) -> np.ndarray:
        u, v = (x - cx) / scale, (y - cy) / scale
        return np.stack([np.ones_like(u), u, v], axis=1)

    out = image.copy()
    design = basis(rx.astype(np.float64), ry.astype(np.float64))
    for channel in range(3):
        coeffs, *_ = np.linalg.lstsq(design, image[ry, rx, channel].astype(np.float64), rcond=None)
        out[ys, xs, channel] = np.clip(basis(xs.astype(np.float64), ys.astype(np.float64)) @ coeffs, 0, 255).astype(np.uint8)
    return out


def extract_frame(bgr: np.ndarray, alpha: np.ndarray) -> dict:
    """Вырезать рамку экрана по внешнему контуру синей полосы (вместе с тонкой канавкой вокруг неё), с прозрачным фоном."""
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    band = ((hsv[:, :, 0] >= 95) & (hsv[:, :, 0] <= 125) & (hsv[:, :, 1] > 35) & (alpha > 200)).astype(np.uint8) * 255
    band[760:, :] = 0  # синие надписи кнопок ниже рамки
    band = cv2.morphologyEx(band, cv2.MORPH_CLOSE, kernel(15))
    count, labels, stats, _ = cv2.connectedComponentsWithStats(band)
    best = max(range(1, count), key=lambda i: stats[i, cv2.CC_STAT_AREA])
    contours, _ = cv2.findContours((labels == best).astype(np.uint8) * 255, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    inside = np.zeros(alpha.shape, np.uint8)
    cv2.drawContours(inside, contours, -1, 255, -1)
    inside = cv2.dilate(inside, kernel(9))  # тонкая канавка вокруг полосы входит в рамку
    soft = cv2.GaussianBlur(inside, (0, 0), 1.2)
    ys, xs = np.where(inside > 0)
    left, top, right, bottom = int(xs.min()) - 3, int(ys.min()) - 3, int(xs.max()) + 4, int(ys.max()) + 4
    out_alpha = (soft.astype(np.float32) / 255 * alpha.astype(np.float32)).astype(np.uint8)[top:bottom, left:right]
    cv2.imwrite(str(DEVICE / 'screen-frame.png'), np.dstack([bgr[top:bottom, left:right], out_alpha]))
    hole = np.where(alpha[163:620, 360:720] < 10)
    hx0, hx1, hy0, hy1 = 360 + int(hole[1].min()), 360 + int(hole[1].max()), 163 + int(hole[0].min()), 163 + int(hole[0].max())
    return {'w': right - left, 'h': bottom - top, 'window': {'x': hx0 - left, 'y': hy0 - top, 'w': hx1 - hx0 + 1, 'h': hy1 - hy0 + 1}}


def main() -> None:
    src = cv2.imread(str(DEVICE / 'body.png'), cv2.IMREAD_UNCHANGED)  # BGRA
    bgr, alpha = src[:, :, :3], src[:, :, 3]
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    hue, sat, val = (hsv[:, :, i].astype(int) for i in range(3))
    pink = ((hue >= 160) | (hue <= 6)) & (sat > 90) & (val > 70)
    yellow = (hue >= 15) & (hue <= 35) & (sat > 110) & (val > 110)
    color = (pink | yellow) & (alpha > 200)
    # Синие подписи рядом с кнопками (START, MELODY…) остаются в корпусе: их не вырезаем и не закрашиваем.
    text = ((hue >= 100) & (hue <= 130) & (sat > 60) & (alpha > 200)).astype(np.uint8) * 255
    text = cv2.dilate(text, kernel(5))

    cut_mask = np.zeros(alpha.shape, np.uint8)
    holes = []
    geometry = {}
    (DEVICE / 'keys').mkdir(exist_ok=True)
    for name, (cx, cy, w, h) in KEYS.items():
        x0, y0 = int(cx - w / 2 - 14), int(cy - h / 2 - 14)
        roi = np.zeros(alpha.shape, bool)
        roi[y0 : y0 + int(h + 28), x0 : x0 + int(w + 28)] = True
        found = cv2.morphologyEx((color & roi).astype(np.uint8) * 255, cv2.MORPH_CLOSE, kernel(9))
        count, labels, stats, _ = cv2.connectedComponentsWithStats(found)
        best = max(range(1, count), key=lambda i: stats[i, cv2.CC_STAT_AREA])
        shape = (labels == best).astype(np.uint8) * 255
        contours, _ = cv2.findContours(shape, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        filled = np.zeros_like(shape)
        cv2.drawContours(filled, contours, -1, 255, -1)
        # Тёмный ободок и мягкая тень вокруг кнопки входят в спрайт; подписи — нет.
        halo = cv2.dilate(filled, kernel(17))
        halo[text > 0] = 0
        cut_mask = np.maximum(cut_mask, halo)
        holes.append(halo)

        ys, xs = np.where(halo > 0)
        left, top, right, bottom = int(xs.min()) - 2, int(ys.min()) - 2, int(xs.max()) + 3, int(ys.max()) + 3
        soft = cv2.GaussianBlur(halo, (0, 0), 1.3)[top:bottom, left:right]
        sprite = np.dstack([bgr[top:bottom, left:right], soft])
        cv2.imwrite(str(DEVICE / 'keys' / f'{name}.png'), sprite)

        # Область нажатия повторяет силуэт кнопки (без тени): многоугольник в процентах рамки спрайта.
        outline = max(contours, key=cv2.contourArea)
        outline = cv2.approxPolyDP(outline, 1.6, True)[:, 0, :]
        width, height = right - left, bottom - top
        clip = [[round((x - left) / width * 100, 1), round((y - top) / height * 100, 1)] for x, y in outline]
        geometry[name] = {'x': left, 'y': top, 'w': width, 'h': height, 'clip': clip}

    # Корпус без кнопок: место кнопок заполняется гладкой поверхностью, подогнанной по окружающему пластику, подписи и надписи остаются.
    # Подписи в оценку фона не попадают (иначе синева «размажется»), но в итоге остаются как были.
    painted = bgr.copy()
    for hole in holes:
        grown = cv2.dilate(hole, kernel(7))
        fill = plastic_fill(bgr, grown, np.maximum(text, cut_mask * (hole == 0)))
        weight = cv2.GaussianBlur(grown, (0, 0), 2.0).astype(np.float32)[:, :, None] / 255
        painted = (fill * weight + painted * (1 - weight)).astype(np.uint8)
    cv2.imwrite(str(DEVICE / 'body-plain.png'), np.dstack([painted, alpha]))
    (ROOT / 'scripts' / 'research' / 'fm38-keys.json').write_text(json.dumps(geometry, indent=1, ensure_ascii=False) + '\n', encoding='utf-8')
    frame = extract_frame(painted, alpha)
    (ROOT / 'scripts' / 'research' / 'fm38-frame.json').write_text(json.dumps(frame, indent=1) + '\n', encoding='utf-8')
    print({name: (g['x'], g['y'], g['w'], g['h'], len(g['clip'])) for name, g in geometry.items()}, frame)


if __name__ == '__main__':
    main()
