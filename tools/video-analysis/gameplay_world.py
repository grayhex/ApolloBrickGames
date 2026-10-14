"""Карта уровня по видео геймплея: из выпрямленного LCD (gameplay_lcd.py) собирает «мир» — какие клетки твёрдые — склейкой кадров по прокрутке.

Запуск (каталог out_dir — тот же, куда gameplay_lcd.py положил lcd.npy и meta.json):

  python3 gameplay_world.py ink       out_dir                    # занятость клеток 13 × 6 по каждому кадру → ink.npy
  python3 gameplay_world.py stitch    out_dir t0 t1              # склейка попыток в отрезке [t0, t1] с → печать карты (# твёрдо, + частично, . пусто, ? не видно)
  python3 gameplay_world.py consensus out_dir t0 t1 [t0b t1b]    # карты нескольких попыток совмещаются и голосуют → cons.npy, cover.npy

Как это работает.
 1. «Занятость» клетки — доля тёмных пикселей в ней после вычитания размытого фона (порог T): ≥ 0,30 — клетка занята. Сетка LCD:
    13 × 6 клеток, X0 = 8, шаг 32 px по x, Y0 = 38,5, шаг 28 px по y на холсте 432 × 216.
 2. Кадры идут по порядку; время каждого — из meta.json (поле `t`), поэтому шаг кадров при извлечении может быть любым. Прокрутка между соседними кадрами — сдвиг сетки на −2…+2 столбца, который
    минимизирует число отличающихся клеток; столбец героя (6) в сравнение не входит (герой движется, камера держит его в середине).
    При размытии или пальце в кадре сдвиг ищется в окне ±12 от последнего хорошего кадра.
 3. Начало попытки — экран «ямы» (колонны слева и справа от пустого столбца, крышка над ним): после гибели уровень начинается заново,
    сдвиг обнуляется. Подряд идущие попытки склеиваются отдельно; клетка мира — голосование по кадрам, в которых она была видна.
 4. consensus: карты разных попыток сдвигаются друг относительно друга (±6 столбцов) до наилучшего совпадения и голосуют ещё раз.
Точность по столбцам — ± 2 (кадры размыты, камера в руках); для уровня 1 три попытки сходятся именно с таким разбросом.
Нужны numpy и opencv-python.
"""
import json
import sys
from pathlib import Path

import cv2
import numpy as np

X0, PX, Y0, PY, T = 8.0, 32.0, 38.5, 28.0, 18


def ink_grid(img):
    """Доля тёмных пикселей в каждой из 6 × 13 клеток кадра LCD."""
    im = img.astype(np.float32)
    dark = cv2.GaussianBlur(im, (0, 0), 20) - im
    grid = np.zeros((6, 13), np.float32)
    for r in range(6):
        for c in range(13):
            x0, x1 = int(X0 + c * PX + 3), int(X0 + (c + 1) * PX - 3)
            y0, y1 = int(Y0 + r * PY + 3), int(Y0 + (r + 1) * PY - 3)
            grid[r, c] = (dark[y0:y1, x0:x1] > T).mean()
    return grid


def build_ink(out: Path) -> np.ndarray:
    lcd = np.load(out / 'lcd.npy')
    meta = json.loads((out / 'meta.json').read_text())
    ink = np.stack([ink_grid(lcd[i]) if meta[i]['inliers'] > 0 else np.full((6, 13), np.nan, np.float32) for i in range(len(lcd))])
    np.save(out / 'ink.npy', ink)
    return ink


def pit_start(b):
    """Экран «ямы»: колонны (строки 3–5) в столбцах 0 и 2, пусто между ними."""
    return bool(b[3, 0] and b[4, 0] and b[5, 0] and b[3, 2] and b[4, 2] and b[5, 2] and not b[5, 1] and not b[3, 1])


def shift_score(a, b, s):
    cols = [c for c in range(13) if 0 <= c + s < 13 and c != 6 and c + s != 6]
    if len(cols) < 6:
        return 9e9
    return (a[:, cols] != b[:, [c + s for c in cols]]).sum() / len(cols)


def stitch(occupied, times, t0, t1):
    """→ (кадры [(индекс, смещение, номер попытки)], индексы начал попыток). `times` — время каждого выбранного кадра (из meta.json: шаг кадров любой)."""
    i0, i1 = int(np.searchsorted(times, t0)), int(np.searchsorted(times, t1))
    offset, prev, attempts, lost, skipped = 0, None, [], True, 0
    frames = []

    def begin(i):
        nonlocal offset, skipped
        offset, skipped = 0, 0
        attempts.append(i)
        frames.append((i, 0, len(attempts) - 1))

    for i in range(i0, i1):
        if np.isnan(occupied[i]).any():
            continue
        b = occupied[i]
        if prev is None or lost:
            if pit_start(b):
                begin(i)
                lost, prev = False, i
            continue
        score = {s: shift_score(occupied[prev], b, s) for s in (-2, -1, 0, 1, 2)}
        best = min(score, key=lambda s: score[s] - (0.01 if s == 0 else 0))
        if score[best] > 1.2:
            if pit_start(b) and not pit_start(occupied[prev]):  # рестарт после гибели
                begin(i)
                prev = i
                continue
            wide = {s: shift_score(occupied[prev], b, s) for s in range(-12, 13)}  # размытие или палец: сдвиг в широком окне
            s2 = min(wide, key=lambda s: wide[s])
            if wide[s2] <= 0.8:
                offset -= s2
                frames.append((i, offset, len(attempts) - 1))
                prev, skipped = i, 0
            else:
                skipped += 1
                lost = skipped > 80
            continue
        skipped = 0
        offset -= best
        frames.append((i, offset, len(attempts) - 1))
        prev = i
    return frames, attempts


def world(occupied, frames):
    lo = min(f[1] for f in frames)
    hi = max(f[1] for f in frames)
    acc = np.zeros((6, hi - lo + 13))
    cnt = np.zeros(hi - lo + 13)
    for i, off, _ in frames:
        for c in range(13):
            if c != 6:
                acc[:, off - lo + c] += occupied[i][:, c]
                cnt[off - lo + c] += 1
    return acc, cnt, lo


def show(acc, cnt, lo, width=110):
    for k in range(0, acc.shape[1], width):
        print('cols %d..%d' % (k + lo, min(acc.shape[1], k + width) + lo))
        for r in range(6):
            line = ''
            for c in range(k, min(acc.shape[1], k + width)):
                if cnt[c] == 0:
                    line += '?'
                else:
                    v = acc[r, c] / cnt[c]
                    line += '#' if v > 0.6 else ('+' if v > 0.3 else '.')
            print(line)


def attempt_maps(occupied, times, t0, t1, min_len=12):
    frames, starts = stitch(occupied, times, t0, t1)
    maps = []
    for a in range(len(starts)):
        part = [f for f in frames if f[2] == a]
        if max(f[1] for f in part) < min_len:
            continue
        acc, cnt, _ = world(occupied, part)
        m = np.full((6, acc.shape[1]), -1.0)
        for c in range(acc.shape[1]):
            if cnt[c] >= 3:
                m[:, c] = acc[:, c] / cnt[c]
        maps.append(m)
    return maps


def agreement(ref, m, s):
    total = n = 0
    for c in range(max(0, s), min(ref.shape[1], m.shape[1] + s)):
        rc, mc = ref[:, c], m[:, c - s]
        ok = (rc >= 0) & (mc >= 0)
        same = (rc[ok] > 0.55) == (mc[ok] > 0.55)
        total += same.sum() - 3 * (~same).sum()
        n += ok.sum()
    return total / max(n, 1)


def consensus(maps):
    ref = max(maps, key=lambda m: m.shape[1])
    length = ref.shape[1]
    votes, cover = np.zeros((6, length)), np.zeros(length)
    for k, m in enumerate(maps):
        best = max(range(-6, 7), key=lambda s: agreement(ref, m, s))
        print('карта %d: ширина %d, сдвиг %d, согласие %.2f' % (k, m.shape[1], best, agreement(ref, m, best)))
        for c in range(m.shape[1]):
            cc = c + best
            if 0 <= cc < length and m[0, c] >= 0:
                votes[:, cc] += m[:, c] > 0.55
                cover[cc] += 1
    return np.where(cover > 0, votes / np.maximum(cover, 1), -1), cover


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    command, out = sys.argv[1], Path(sys.argv[2])
    if command == 'ink':
        build_ink(out)
        return
    occupied = np.load(out / 'ink.npy') > 0.30
    nan = np.isnan(np.load(out / 'ink.npy')).any(axis=(1, 2))
    occupied_nan = np.where(nan[:, None, None], np.nan, occupied.astype(float))
    times = np.array([m['t'] for m in json.loads((out / 'meta.json').read_text())])
    t0, t1 = float(sys.argv[3]), float(sys.argv[4])
    if command == 'stitch':
        frames, starts = stitch(occupied_nan, times, t0, t1)
        print('попыток:', len(starts), [round(float(times[a]), 1) for a in starts])
        show(*world(occupied_nan, frames))
    elif command == 'consensus':
        maps = attempt_maps(occupied_nan, times, t0, t1)
        if len(sys.argv) >= 7:
            maps += attempt_maps(occupied_nan, times, float(sys.argv[5]), float(sys.argv[6]))
        cons, cover = consensus(maps)
        np.save(out / 'cons.npy', cons)
        np.save(out / 'cover.npy', cover)
        for r in range(6):
            print(''.join('?' if cover[c] == 0 else ('#' if cons[r, c] > 0.6 else ('+' if cons[r, c] > 0.3 else '.')) for c in range(len(cover))))
    else:
        print(__doc__)


if __name__ == '__main__':
    main()
