"""
Генератор поля для Sokoban библиотеки Brick Game: десять собственных задач возрастающей сложности с проверенными решениями.

    python3 tools/sokoban/generate.py > src/brick/games/library/sokobanLevels.ts

Задача строится обратным ходом: ящики стоят на целях, затем игрок «тянет» их случайными шагами назад — так начальная расстановка заведомо решаема.
Каждая задача затем решается поиском в ширину (по состояниям «игрок + ящики»), берётся кратчайшее решение; задачи отбираются по длине решения.
Карты — собственные (не из публичных наборов Sokoban). Нужны только стандартная библиотека Python.
"""
import random
from collections import deque

DIRS = {'u': (0, -1), 'r': (1, 0), 'd': (0, 1), 'l': (-1, 0)}


def build_room(rng, w, h, blocks):
    """Прямоугольная комната с несколькими внутренними стенками; True — стена."""
    walls = {(x, y) for x in range(w) for y in range(h) if x in (0, w - 1) or y in (0, h - 1)}
    cells = [(x, y) for x in range(2, w - 2) for y in range(2, h - 2)]
    rng.shuffle(cells)
    for c in cells[:blocks]:
        walls.add(c)
    floor = {(x, y) for x in range(w) for y in range(h)} - walls
    # Связность пола
    start = next(iter(floor))
    seen, queue = {start}, deque([start])
    while queue:
        cx, cy = queue.popleft()
        for dx, dy in DIRS.values():
            n = (cx + dx, cy + dy)
            if n in floor and n not in seen:
                seen.add(n)
                queue.append(n)
    return walls if seen == floor else None


def reverse_scramble(rng, walls, goals, steps, w, h):
    floor = [(x, y) for x in range(w) for y in range(h) if (x, y) not in walls]
    crates = set(goals)
    free = [c for c in floor if c not in crates]
    player = rng.choice(free)
    for _ in range(steps):
        moves = list(DIRS.values())
        rng.shuffle(moves)
        for dx, dy in moves:
            np_ = (player[0] + dx, player[1] + dy)
            if np_ in walls or np_ in crates:
                continue
            behind = (player[0] - dx, player[1] - dy)
            if behind in crates and rng.random() < 0.7:
                crates.remove(behind)
                crates.add(player)  # ящик тянется за игроком
            player = np_
            break
    return player, crates


def solve(walls, goals, player, crates, limit=250000):
    start = (player, frozenset(crates))
    seen = {start: None}
    queue = deque([start])
    goals = frozenset(goals)
    while queue:
        state = queue.popleft()
        p, cs = state
        if cs == goals:
            path = []
            while seen[state] is not None:
                state, move = seen[state]
                path.append(move)
            return ''.join(reversed(path))
        for key, (dx, dy) in DIRS.items():
            n = (p[0] + dx, p[1] + dy)
            if n in walls:
                continue
            if n in cs:
                beyond = (n[0] + dx, n[1] + dy)
                if beyond in walls or beyond in cs:
                    continue
                nxt = (n, (cs - {n}) | {beyond})
                move = key.upper()
            else:
                nxt = (n, cs)
                move = key
            if nxt not in seen:
                seen[nxt] = (state, move)
                queue.append(nxt)
                if len(seen) > limit:
                    return None
    return None


def render(walls, goals, player, crates, w, h):
    rows = []
    for y in range(h):
        row = ''
        for x in range(w):
            c = (x, y)
            if c in walls:
                row += '#'
            elif c == player:
                row += '+' if c in goals else '@'
            elif c in crates:
                row += '*' if c in goals else '$'
            elif c in goals:
                row += '.'
            else:
                row += ' '
        rows.append(row.rstrip())
    return rows


SPECS = [  # (ширина, высота, внутренние стенки, ящиков, шагов обратного хода, мин. длина решения)
    (6, 6, 0, 1, 30, 6), (7, 6, 1, 1, 60, 10), (7, 6, 2, 2, 60, 12), (7, 7, 2, 2, 80, 16), (7, 7, 3, 2, 100, 20),
    (7, 8, 3, 3, 100, 24), (7, 8, 4, 3, 120, 28), (8, 8, 4, 3, 140, 32), (8, 8, 5, 3, 220, 34), (8, 9, 6, 3, 300, 36),
]


def main():
    levels = []
    for index, (w, h, blocks, crate_count, steps, min_len) in enumerate(SPECS):
        rng = random.Random(1000 + index)
        for _ in range(6000):
            walls = build_room(rng, w, h, blocks)
            if walls is None:
                continue
            floor = [(x, y) for x in range(w) for y in range(h) if (x, y) not in walls]
            goals = set(rng.sample(floor, crate_count))
            player, crates = reverse_scramble(rng, walls, goals, steps, w, h)
            if crates & goals or player in crates:
                continue
            solution = solve(walls, goals, player, crates)
            if solution is None or len(solution) < min_len:
                continue
            levels.append((render(walls, goals, player, crates, w, h), solution))
            break
        else:
            raise SystemExit(f'не нашёл задачу {index + 1}')
    print('/** Сгенерировано `tools/sokoban/generate.py` — вручную не править. Собственные задачи; решение — кратчайшее (строчная буква — шаг, заглавная — толчок). */')
    print('export interface SokobanLevel { map: readonly string[]; solution: string }')
    print('/** `#` стена, `@` игрок, `+` игрок на цели, `$` ящик, `*` ящик на цели, `.` цель. */')
    print('export const SOKOBAN_LEVELS: readonly SokobanLevel[] = [')
    for rows, solution in levels:
        print('  {')
        print('    map: [' + ', '.join("'" + r + "'" for r in rows) + '],')
        print("    solution: '" + solution + "',")
        print('  },')
    print('];')


main()
