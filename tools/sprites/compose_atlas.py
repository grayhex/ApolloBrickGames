"""Кадры клетки в `public/graphics/lcd/lcd_atlas.png` и снаряд `lcd_heart.png` — из маски `block-gaps.png`.

Использование (из корня репозитория): python3 tools/sprites/compose_atlas.py

Маска — зазоры между сегментами клетки (белое — свет), снятая с макрофотографий LCD (`extract_block.py`): тёмный прямоугольник 120 × 104
с вырезами-контурами фигурки. Из неё:
  cell.obstacle, cell.all_on — блок: все сегменты включены (тёмный прямоугольник, светлые контуры шляпы, сердца, рук и ног);
  cell.player — герой: только сегменты фигурки (тёмные области, целиком окружённые светлым контуром: шляпа, руки, сердце, ступни);
  cell.ghost — те же тёмные области блока с прозрачностью 8 % (выключенные сегменты);
  hud.life, hud.lives3 — значки жизни: та же фигурка, уменьшенная до 36 px по ширине (на фото оригинала жизни — три крошечных героя);
  lcd_heart.png — центральная область-сердце как снаряд на холсте клетки (и как сердце-предмет: один и тот же сегмент);
  lcd_devil.png — малый чёрт: включены только сегменты фона (верхний, три нижних), сегменты фигурки (шляпа, руки, сердце, ступни) погашены —
    «негатив» героя: тёмный блок с белым силуэтом (на видео геймплея малый чёрт — два тёмных пятна сверху, светлая полоса и тёмная полоса снизу);
  lcd_devil_big.png — клетка большого чёрта 2 × 2: тот же фон и включено центральное сердце — «один чёрный глаз» в каждой клетке.
Остальные кадры атласа (цифры, пустая клетка, метка, значки) не трогаются. Чернила — RGB (48, 58, 48), прозрачность несёт форму.
"""
import cv2
import numpy as np

SS = 4
INK = (48, 58, 48)
CELL = (128, 112)
RECT = (4, 4, 120, 104)  # тёмный прямоугольник в клетке: левый верх, размеры
FRAMES = {'player': (4, 4), 'obstacle': (136, 4), 'all_on': (268, 4), 'ghost': (400, 4)}
GHOST = 0.082
LIFE = {'life': (796, 4, 48, 48, [4]), 'lives3': (848, 4, 136, 48, [4, 48, 92])}  # кадр: (x, y, ширина, высота, левые края значков)
LIFE_SIZE = (36, 33)  # ширина и высота значка; верхний край — 4
ATLAS = 'public/graphics/lcd/lcd_atlas.png'
HEART = 'public/graphics/lcd/lcd_heart.png'
DEVIL = 'public/graphics/lcd/lcd_devil.png'
DEVIL_BIG = 'public/graphics/lcd/lcd_devil_big.png'


def frame(coverage):
    """Покрытие 4× внутри прямоугольника (0…1) → RGBA клетки 128 × 112 (усреднение 4 × 4)."""
    canvas = np.zeros((CELL[1] * SS, CELL[0] * SS), np.float32)
    x, y, w, h = RECT
    canvas[y * SS : (y + h) * SS, x * SS : (x + w) * SS] = coverage
    alpha = cv2.resize(canvas, CELL, interpolation=cv2.INTER_AREA)
    out = np.zeros((CELL[1], CELL[0], 4), np.uint8)
    out[..., :3] = (INK[2], INK[1], INK[0])  # BGR
    out[..., 3] = np.round(alpha * 255).astype(np.uint8)
    out[out[..., 3] == 0] = 0
    return out


def main():
    gaps = cv2.imread('tools/sprites/block-gaps.png', cv2.IMREAD_GRAYSCALE) > 127
    dark = (~gaps).astype(np.uint8)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(dark, connectivity=4)
    height, width = dark.shape
    figure = np.zeros_like(dark)
    heart = np.zeros_like(dark)
    for i in range(1, n):
        x, y, w, h, area = stats[i]
        if x == 0 or y == 0 or x + w == width or y + h == height or area < 200:
            continue  # сегменты фона касаются края прямоугольника; сегменты фигурки — внутри
        figure[labels == i] = 1
        if area > 10000 and 140 < w < 180:  # сердце: единственная область такой ширины и площади
            heart[labels == i] = 1
    frames = {
        'player': frame(figure.astype(np.float32)),
        'obstacle': frame(dark.astype(np.float32)),
        'all_on': frame(dark.astype(np.float32)),
        'ghost': frame(dark.astype(np.float32) * GHOST),
    }
    atlas = cv2.imread(ATLAS, cv2.IMREAD_UNCHANGED)
    for name, (x, y) in FRAMES.items():
        atlas[y : y + CELL[1], x : x + CELL[0]] = frames[name]
    ys, xs = np.nonzero(figure)
    icon = cv2.resize(figure[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1].astype(np.float32), LIFE_SIZE, interpolation=cv2.INTER_AREA)
    for x, y, w, h, lefts in LIFE.values():
        canvas = np.zeros((h, w), np.float32)
        for left in lefts:
            canvas[4 : 4 + LIFE_SIZE[1], left : left + LIFE_SIZE[0]] = icon
        part = np.zeros((h, w, 4), np.uint8)
        part[..., :3] = (INK[2], INK[1], INK[0])
        part[..., 3] = np.round(canvas * 255).astype(np.uint8)
        part[part[..., 3] == 0] = 0
        atlas[y : y + h, x : x + w] = part
    cv2.imwrite(ATLAS, atlas)
    cv2.imwrite(HEART, frame(heart.astype(np.float32)))
    background = dark & (1 - figure)  # сегменты фона: блок без фигурки
    cv2.imwrite(DEVIL, frame(background.astype(np.float32)))
    cv2.imwrite(DEVIL_BIG, frame(np.maximum(background, heart).astype(np.float32)))
    for name, f in frames.items():
        print(name, 'покрытие', round(float((f[..., 3] > 40).mean()), 3))


if __name__ == '__main__':
    main()
