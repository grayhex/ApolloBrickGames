"""Враги, таймер и сцены по видео геймплея: контактные листы и трекинг «чертей» по выпрямленному LCD (gameplay_lcd.py).

Запуск (out_dir — каталог с lcd.npy и meta.json из gameplay_lcd.py; время — секунды видео; кадры LCD выбираются по времени из meta.json, шаг извлечения любой):

  python3 gameplay_enemies.py montage out_dir от шаг число out.png [столбцов=4] [масштаб=1.0] [y0=0] [y1=216]
      контактный лист: `число` кадров LCD, начиная с `от`, через `шаг` секунд (подписи времени)
  python3 gameplay_enemies.py timer out_dir от шаг число out.png
      полоса HUD (поле таймера TIME …) крупно: единицы таймера читаются глазами (методика §10 docs/video-observations.md)
  python3 gameplay_enemies.py cells out_dir out.png время:столбец:ряд [время:столбец:ряд ...]
      вырезки отдельных клеток LCD (8× растяжение контраста): как выглядят герой, сердце, малый и большой чёрт, блок (раздел 11 docs/video-observations.md);
      столбцы 0–12, ряды 0–5, например: 207.3:5:4 (герой) 209.1:9:1 (клетка большого чёрта) 126.0:6:2 (малый чёрт) 209.1:6:5 (блок)
  python3 gameplay_enemies.py spots out_dir от до
      тёмные пятна 8–260 px и их положение внутри клетки (доли ширины и высоты) — по ним определяется, какой сегмент горит (центр клетки ≈ 0,5; 0,45)
  python3 gameplay_enemies.py big out_dir от до
      большой чёрт 2 × 2: левый верхний угол кластера (столбец, ряд) на экране по тёмным «глазам» клеток (чёрные пятна 10–150 px)
      и положение героя (столбец) — построчно, только когда что-то поменялось

Как найти чёрта: у каждой клетки большого чёрта один чёрный «глаз» (пятно ≈ 20 px на холсте 432 × 216); у малого чёрта в клетке два глаза и рот.
Пятна ищутся по порогу «фон − кадр» (размытый фон σ = 12, порог 42), клетка — округление координат пятна к сетке LCD (X0 = 8, шаг 32; Y0 = 38,5, шаг 28).
Кластер 2 × 2 — левый верхний угол, у которого заняты ≥ 2 из 4 клеток. Точность — клетка; кадры размыты, пальцы и блики дают одиночные промахи.
Нужны numpy, opencv-python, pillow.
"""
import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw

X0, PX, Y0, PY = 8.0, 32.0, 38.5, 28.0


def load(out: Path):
    """→ (кадры LCD, время каждого кадра в секундах из meta.json)."""
    times = np.array([m['t'] for m in json.loads((out / 'meta.json').read_text())])
    return np.load(out / 'lcd.npy'), times


def index_at(times, t):
    """Индекс ближайшего по времени кадра."""
    return int(np.abs(times - t).argmin())


def dark(img: np.ndarray, sigma: float = 12) -> np.ndarray:
    im = img.astype(np.float32)
    return np.clip(cv2.GaussianBlur(im, (0, 0), sigma) - im, 0, 120)


def stretch(im: np.ndarray) -> np.ndarray:
    lo, hi = np.percentile(im, 2), np.percentile(im, 98)
    return np.clip((im - lo) / (hi - lo + 1e-6), 0, 1) * 255


def montage(lcd, times, t0, dt, n, out, cols=4, scale=1.0, y0=0, y1=216):
    tw, th = int(432 * scale), int((y1 - y0) * scale)
    rows = (n + cols - 1) // cols
    sheet = Image.new('L', (cols * (tw + 4), rows * (th + 14)), 30)
    draw = ImageDraw.Draw(sheet)
    for k in range(n):
        t = t0 + k * dt
        i = index_at(times, t)
        tile = Image.fromarray(stretch(lcd[i][y0:y1].astype(np.float32)).astype(np.uint8)).resize((tw, th), Image.LANCZOS)
        x, y = (k % cols) * (tw + 4), (k // cols) * (th + 14)
        sheet.paste(tile, (x, y + 12))
        draw.text((x + 3, y), '%.1fs' % t, fill=255)
    sheet.save(out)


def timer_strip(lcd, times, t0, dt, n, out):
    tiles = []
    for k in range(n):
        t = t0 + k * dt
        crop = stretch(lcd[index_at(times, t)][0:42, 40:200].astype(np.float32))
        tile = Image.fromarray(crop.astype(np.uint8)).resize((480, 126), Image.LANCZOS)
        ImageDraw.Draw(tile).text((4, 2), '%.1fs' % t, fill=255)
        tiles.append(tile)
    cols = 3
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new('L', (cols * 484, rows * 130), 30)
    for k, tile in enumerate(tiles):
        sheet.paste(tile, ((k % cols) * 484, (k // cols) * 130))
    sheet.save(out)


def blobs(img, thr=42, amin=10, amax=150, y0=40, y1=160):
    d = dark(img)
    m = (d > thr).astype(np.uint8)
    m[:y0] = 0
    m[y1:] = 0
    m[:, :14] = 0
    m[:, 418:] = 0
    n, _, st, cen = cv2.connectedComponentsWithStats(m, 8)
    return [(cen[k][0], cen[k][1]) for k in range(1, n) if amin <= st[k][4] <= amax]


def cell_of(x, y):
    return round((x - 8) / 32 - 0.5), round((y - 38.5) / 28 - 0.5)


def hero_col(img):
    d = dark(img)
    m = (d > 30).astype(np.uint8)
    m[:120] = 0
    m[180:] = 0
    m[:, :14] = 0
    m[:, 418:] = 0
    n, _, st, cen = cv2.connectedComponentsWithStats(m, 8)
    cols = [round(float((cen[k][0] - 8) / 32 - 0.5), 1) for k in range(1, n) if 12 <= st[k][4] <= 260 and st[k][3] < 40 and (cen[k][1] - 38.5) / 28 - 0.5 > 3.6]
    return cols[0] if cols else None


def track_big(lcd, times, t0, t1):
    prev = None
    for i in range(int(np.searchsorted(times, t0)), int(np.searchsorted(times, t1))):
        cells = sorted({cell_of(x, y) for x, y in blobs(lcd[i])})
        best = None
        for c in range(-1, 13):
            for r in range(-1, 5):
                k = sum((c + dc, r + dr) in cells for dc in (0, 1) for dr in (0, 1))
                if k >= 2 and (best is None or k > best[0]):
                    best = (k, c, r)
        state = ((best[1], best[2]) if best else None, hero_col(lcd[i]))
        if state != prev:
            print('%.1f чёрт=%s герой=%s' % (times[i], state[0], state[1]))
            prev = state


def cells_sheet(lcd, times, specs, out, scale=8):
    """Вырезки клеток: окно клетки плюс 4 px вокруг; контраст растягивается по кадру целиком (чтобы бледные сегменты не терялись)."""
    tiles = []
    for spec in specs:
        t, col, row = spec.split(':')
        i = index_at(times, float(t))
        x0, y0 = int(round(X0 + int(col) * PX - 4)), int(round(Y0 + int(row) * PY - 4))
        img = lcd[i].astype(np.float32)
        lo, hi = np.percentile(img, 1), np.percentile(img, 60)
        crop = np.clip((img[max(0, y0):y0 + int(PY) + 8, max(0, x0):x0 + int(PX) + 8] - lo) / (hi - lo + 1e-6), 0, 1) * 255
        tile = Image.fromarray(crop.astype(np.uint8)).resize((crop.shape[1] * scale, crop.shape[0] * scale), Image.LANCZOS)
        ImageDraw.Draw(tile).text((4, 2), spec, fill=0)
        tiles.append(tile)
    width = sum(t.width for t in tiles) + 10 * len(tiles)
    sheet = Image.new('L', (width, max(t.height for t in tiles)), 40)
    x = 0
    for tile in tiles:
        sheet.paste(tile, (x, 0))
        x += tile.width + 10
    sheet.save(out)


def spots(lcd, times, t0, t1):
    """Пятна по кадрам: клетка и положение пятна внутри неё (доли). Центральное сердце — около (0,5; 0,45)."""
    for i in range(int(np.searchsorted(times, t0)), int(np.searchsorted(times, t1))):
        d = dark(lcd[i])
        n, _, st, cen = cv2.connectedComponentsWithStats((d > 42).astype(np.uint8), 8)
        found = []
        for k in range(1, n):
            if 8 <= st[k][4] <= 260 and 44 < cen[k][1] < 180:  # выше 44 px — строка HUD
                col, row = (cen[k][0] - X0) / PX, (cen[k][1] - Y0) / PY
                found.append('(%d,%d)@%.2f,%.2f' % (int(col), int(row), col % 1, row % 1))
        print('%.1f %s' % (times[i], ' '.join(found)))


def main():
    if len(sys.argv) < 4:
        print(__doc__)
        sys.exit(1)
    command, out = sys.argv[1], Path(sys.argv[2])
    lcd, times = load(out)
    if command == 'montage':
        t0, dt, n, png = float(sys.argv[3]), float(sys.argv[4]), int(sys.argv[5]), sys.argv[6]
        extra = sys.argv[7:]
        montage(lcd, times, t0, dt, n, png, int(extra[0]) if extra else 4, float(extra[1]) if len(extra) > 1 else 1.0,
                int(extra[2]) if len(extra) > 2 else 0, int(extra[3]) if len(extra) > 3 else 216)
    elif command == 'timer':
        timer_strip(lcd, times, float(sys.argv[3]), float(sys.argv[4]), int(sys.argv[5]), sys.argv[6])
    elif command == 'big':
        track_big(lcd, times, float(sys.argv[3]), float(sys.argv[4]))
    elif command == 'cells':
        cells_sheet(lcd, times, sys.argv[4:], sys.argv[3])
    elif command == 'spots':
        spots(lcd, times, float(sys.argv[3]), float(sys.argv[4]))
    else:
        print(__doc__)


if __name__ == '__main__':
    main()
