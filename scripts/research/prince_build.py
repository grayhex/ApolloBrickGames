#!/usr/bin/env python3
"""
Prince 皇太子 (118 in 1, AX-128): сборка графики для сайта.

Источники: архив владельца `docs/research/Prince-118-AX128-graphics.zip` (подписи кнопок и наклейка), **снимок передней панели оригинала** `docs/research/Prince-front-panel.webp`
(RGBA: настоящая рамка с окном под экран, декалями, скосами и тиснением «爱孩电子» — верхняя часть корпуса берётся с него без перерисовки) и фотография устройства целиком (размеры сняты
с неё в пикселях, поэтому координаты ниже — «пиксели фото»). Нижняя часть корпуса и кнопки нарисованы здесь по фото:
  • кнопки-стрелки — веерные сектора острием к центру крестовины, большая ROTATE — капсула, четыре малые — круглые; у всех тёмная обводка и своя «нажатая» копия;
  • подписи кнопок (иероглифы из архива) стоят по местам фото и не налезают друг на друга; тиснёная волна под малыми кнопками, наклейка внизу.
Результат — `public/devices/prince118/`: `body.webp` (корпус целиком, прозрачное окно экрана), `lid.webp` (только верхняя часть для вида «только экран»), `keys/<кнопка>.svg` и
`keys/<кнопка>-pressed.svg`, `logo.webp` (наклейка для карточки) и `scripts/research/prince118-layout.json` (положения окна и кнопок, контуры нажатия: его читает `src/app/princeModel.ts`).

Запуск:  python3 scripts/research/prince_build.py   (нужны Pillow, NumPy и Node с Playwright из node_modules проекта: SVG рисуется Chromium).
"""
from __future__ import annotations

import io
import json
import math
import re
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
ZIP = ROOT / "docs/research/Prince-118-AX128-graphics.zip"
PANEL = ROOT / "docs/research/Prince-front-panel.webp"
OUT = ROOT / "public/devices/prince118"
LAYOUT = ROOT / "scripts/research/prince118-layout.json"

# ── общая система координат: пиксели фото ─────────────────────────────────────────────────────────────────────────────
CX = 439.0  # ось симметрии корпуса
BODY_BOX = (70, 290, 810, 1780)  # x0, y0, x1, y1: поле вокруг корпуса (тень и запас)
SCALE = 1.6  # пикселей картинки на пиксель фото

# Снимок передней панели (`Prince-front-panel.webp`, 1448 × 1086): сплошная часть рамки и окно под стекло, пиксели снимка. Масштаб подобран по ширине стекла на фото
# устройства (305 px при ширине окна на снимке 541 px): так высота рамки (≈ 595 px) тоже совпадает с фото (≈ 602 px).
PANEL_SOLID = (141, 18, 1307, 1074)
PANEL_HOLE = (452, 172, 993, 939)
PANEL_SCALE = 0.5638
PANEL_CENTER_X = (PANEL_SOLID[0] + PANEL_SOLID[2]) / 2
LID_TOP = 308.0  # верх рамки (дуга) на фото


def panel_xy(x: float, y: float) -> tuple[float, float]:
    """Точка снимка панели → пиксели фото."""
    return CX + (x - PANEL_CENTER_X) * PANEL_SCALE, LID_TOP + (y - PANEL_SOLID[1]) * PANEL_SCALE


_hx0, _hy0 = panel_xy(PANEL_HOLE[0], PANEL_HOLE[1])
GLASS = dict(x=_hx0, y=_hy0, w=(PANEL_HOLE[2] - PANEL_HOLE[0]) * PANEL_SCALE, h=(PANEL_HOLE[3] - PANEL_HOLE[1]) * PANEL_SCALE)  # прозрачное окно под экран
LID_BOTTOM = panel_xy(0, PANEL_SOLID[3])[1]  # низ рамки: ниже — нижняя часть корпуса

INK = "#3a2d0b"  # обводка кнопок
YELLOW = ("#fff0a6", "#f6d453", "#e4b631", "#c9961f")
YELLOW_PRESSED = ("#f0d97c", "#e6bf3d", "#d1a02a", "#b2821a")


def smooth_path(points: list[tuple[float, float]]) -> str:
    """Гладкая кривая через точки (Catmull-Rom → кубические Безье), открытая."""
    p = [points[0], *points, points[-1]]
    d = f"M{p[1][0]:.1f} {p[1][1]:.1f}"
    for i in range(1, len(p) - 2):
        p0, p1, p2, p3 = p[i - 1], p[i], p[i + 1], p[i + 2]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f"C{c1[0]:.1f} {c1[1]:.1f} {c2[0]:.1f} {c2[1]:.1f} {p2[0]:.1f} {p2[1]:.1f}"
    return d


def lower_body_path() -> str:
    """Нижняя часть корпуса: верх спрятан под рамкой, плечи чуть шире рамки, «талия» у крестовины, расширение книзу, скруглённый низ."""
    half = [(870, 330), (903, 330), (926, 331), (1020, 327), (1130, 322), (1250, 327), (1400, 335), (1560, 341), (1680, 344)]
    right = [(CX + w, y) for y, w in half]
    left = [(CX - w, y) for y, w in reversed(half)]
    r, bottom = 62, 1757
    d = f"M{CX - 330:.1f} 870L{CX + 330:.1f} 870" + smooth_path(right).replace("M", "L", 1)
    d += f"Q{right[-1][0]:.1f} {bottom} {right[-1][0] - r:.1f} {bottom}L{left[0][0] + r:.1f} {bottom}Q{left[0][0]:.1f} {bottom} {left[0][0]:.1f} {left[0][1]:.1f}"
    d += smooth_path(left).replace("M", "L", 1)
    return d + "Z"



# ── кнопки ────────────────────────────────────────────────────────────────────────────────────────────────────────
PAD = (322.0, 1100.0)  # центр крестовины
FAN = dict(r_in=40.0, r_out=110.0, half=32.0)  # веер: внутренний и внешний радиус, полуугол


def fan_path(angle_deg: float, rc: float = 9.0) -> str:
    """Веерный сектор с центром на оси `angle_deg` (0° — вправо, углы по часовой стрелке): узкий конец к центру крестовины, дуга снаружи; углы скруглены."""
    a0, a1 = angle_deg - FAN["half"], angle_deg + FAN["half"]

    def pt(r: float, a: float) -> tuple[float, float]:
        return PAD[0] + r * math.cos(math.radians(a)), PAD[1] + r * math.sin(math.radians(a))

    ro, ri = FAN["r_out"], FAN["r_in"]
    # скругление углов: отступаем на rc по сторонам и дуге
    d_out = math.degrees(rc / ro)
    d_in = math.degrees(rc / ri)
    p_a = pt(ro, a0 + d_out)
    p_b = pt(ro, a1 - d_out)
    c_b = pt(ro, a1)
    p_c = pt(ro - rc, a1)  # вдоль стороны от внешнего угла к внутреннему
    c_end = pt(ri, a1)
    p_d = pt(ri + rc, a1)
    p_e = pt(ri, a1 - d_in)
    p_f = pt(ri, a0 + d_in)
    c_a_in = pt(ri, a0)
    p_g = pt(ri + rc, a0)
    c_a = pt(ro, a0)
    p_h = pt(ro - rc, a0)
    f = lambda p: f"{p[0]:.1f} {p[1]:.1f}"  # noqa: E731
    return (
        f"M{f(p_a)}A{ro} {ro} 0 0 1 {f(p_b)}Q{f(c_b)} {f(p_c)}L{f(p_d)}Q{f(c_end)} {f(p_e)}"
        f"A{ri} {ri} 0 0 0 {f(p_f)}Q{f(c_a_in)} {f(p_g)}L{f(p_h)}Q{f(c_a)} {f(p_a)}Z"
    )


def capsule(cx: float, cy: float, length: float, width: float, angle: float) -> str:
    return (
        f'<rect x="{cx - width / 2:.1f}" y="{cy - length / 2:.1f}" width="{width}" height="{length}" rx="{width / 2 - 2}" '
        f'transform="rotate({angle} {cx} {cy})"/>'
    )


# (id, тип, параметры). Все координаты — пиксели фото.
KEYS: dict[str, dict] = {
    "up": dict(kind="fan", angle=-90),
    "right": dict(kind="fan", angle=0),
    "down": dict(kind="fan", angle=90),
    "left": dict(kind="fan", angle=180),
    "rotate": dict(kind="capsule", cx=594, cy=1093, length=142, width=90, angle=-25),
    "reset": dict(kind="circle", cx=285, cy=1303, r=22.5),
    "sp": dict(kind="circle", cx=383, cy=1305, r=22.5),
    "sound": dict(kind="circle", cx=477, cy=1307, r=22.5),
    "power": dict(kind="circle", cx=574, cy=1307, r=22.5),
}


def key_shape(spec: dict) -> str:
    """Контур кнопки как SVG-элемент (без стилей)."""
    if spec["kind"] == "fan":
        return f'<path d="{fan_path(spec["angle"])}"/>'
    if spec["kind"] == "capsule":
        return capsule(spec["cx"], spec["cy"], spec["length"], spec["width"], spec["angle"])
    return f'<circle cx="{spec["cx"]}" cy="{spec["cy"]}" r="{spec["r"]}"/>'


def key_bbox(spec: dict) -> tuple[float, float, float, float]:
    if spec["kind"] == "fan":
        pts = []
        a0, a1 = spec["angle"] - FAN["half"], spec["angle"] + FAN["half"]
        for a in np.linspace(a0, a1, 25):
            for r in (FAN["r_in"], FAN["r_out"]):
                pts.append((PAD[0] + r * math.cos(math.radians(a)), PAD[1] + r * math.sin(math.radians(a))))
        xs, ys = zip(*pts)
        return min(xs), min(ys), max(xs), max(ys)
    if spec["kind"] == "capsule":
        c, L, W, th = (spec["cx"], spec["cy"]), spec["length"], spec["width"], math.radians(spec["angle"])
        ex = abs(L / 2 * math.sin(th)) + abs(W / 2 * math.cos(th))
        ey = abs(L / 2 * math.cos(th)) + abs(W / 2 * math.sin(th))
        return c[0] - ex, c[1] - ey, c[0] + ex, c[1] + ey
    return spec["cx"] - spec["r"], spec["cy"] - spec["r"], spec["cx"] + spec["r"], spec["cy"] + spec["r"]


def key_outline(spec: dict) -> list[tuple[float, float]]:
    """Контур кнопки ломаной (пиксели фото): область нажатия повторяет форму, а не прямоугольник."""
    if spec["kind"] == "fan":
        a0, a1 = spec["angle"] - FAN["half"], spec["angle"] + FAN["half"]
        pts = [(PAD[0] + FAN["r_out"] * math.cos(math.radians(a)), PAD[1] + FAN["r_out"] * math.sin(math.radians(a))) for a in np.linspace(a0, a1, 14)]
        pts += [(PAD[0] + FAN["r_in"] * math.cos(math.radians(a)), PAD[1] + FAN["r_in"] * math.sin(math.radians(a))) for a in np.linspace(a1, a0, 8)]
        return pts
    if spec["kind"] == "capsule":
        th = math.radians(spec["angle"])
        r = spec["width"] / 2
        half = spec["length"] / 2 - r
        pts = [(r * math.cos(math.radians(a)), -half + r * math.sin(math.radians(a))) for a in np.linspace(180, 360, 12)]
        pts += [(r * math.cos(math.radians(a)), half + r * math.sin(math.radians(a))) for a in np.linspace(0, 180, 12)]
        return [(spec["cx"] + x * math.cos(th) - y * math.sin(th), spec["cy"] + x * math.sin(th) + y * math.cos(th)) for x, y in pts]
    return [(spec["cx"] + spec["r"] * math.cos(math.radians(a)), spec["cy"] + spec["r"] * math.sin(math.radians(a))) for a in np.linspace(0, 360, 28, endpoint=False)]


MARGIN = 7.0


def key_svg(name: str, pressed: bool) -> tuple[str, dict]:
    """Отдельный спрайт кнопки: заливка с блёстками, тёмная обводка, у нажатой — темнее и без бликов."""
    spec = KEYS[name]
    x0, y0, x1, y1 = key_bbox(spec)
    x0, y0, x1, y1 = x0 - MARGIN, y0 - MARGIN, x1 + MARGIN, y1 + MARGIN
    w, h = x1 - x0, y1 - y0
    c = YELLOW_PRESSED if pressed else YELLOW
    shape = key_shape(spec)
    sw = 3.4
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="{w:.1f}" height="{h:.1f}" viewBox="{x0:.1f} {y0:.1f} {w:.1f} {h:.1f}" role="img">
<title>{name}{' pressed' if pressed else ''}</title>
<defs>
<linearGradient id="fill" x1="0.1" y1="0" x2="0.9" y2="1"><stop offset="0" stop-color="{c[0]}"/><stop offset=".35" stop-color="{c[1]}"/><stop offset=".75" stop-color="{c[2]}"/><stop offset="1" stop-color="{c[3]}"/></linearGradient>
<radialGradient id="spec" cx=".3" cy=".22" r=".7"><stop offset="0" stop-color="#fff" stop-opacity="{'.18' if pressed else '.62'}"/><stop offset=".7" stop-color="#fff" stop-opacity="0"/></radialGradient>
<clipPath id="clip">{shape}</clipPath>
</defs>
<g fill="url(#fill)" stroke="{INK}" stroke-width="{sw}" stroke-linejoin="round">{shape}</g>
<g clip-path="url(#clip)"><g fill="url(#spec)">{shape}</g>
<g fill="none" stroke="#fff6c4" stroke-width="2" opacity="{'.25' if pressed else '.7'}" transform="translate(-1.6 -1.6)">{shape}</g>
<g fill="none" stroke="#7a5a10" stroke-width="3" opacity=".35" transform="translate(1.8 2.2)">{shape}</g></g>
<g fill="none" stroke="{INK}" stroke-width="{sw}" stroke-linejoin="round">{shape}</g>
</svg>
"""
    return svg, dict(x=x0, y=y0, w=w, h=h)


def key_seat_svg(name: str) -> str:
    """Гнездо под кнопкой на корпусе: тень, чтобы кнопка выглядела приподнятой."""
    shape = key_shape(KEYS[name])
    return f'<g fill="#6f6446" opacity=".42" filter="url(#blur3)" transform="translate(3 4.5)">{shape}</g>'


# ── подписи ───────────────────────────────────────────────────────────────────────────────────────────────────────
LABELS = [  # индекс группы в архиве → (центр x, центр y, число иероглифов)
    (0, 243, 981, 1),  # 上
    (1, 427, 985, 1),  # 上
    (2, 178, 1108, 1),  # 左
    (3, 474, 1114, 1),  # 右
    (4, 306, 1229, 1),  # 下
    (5, 603, 988, 2),  # 旋转
    (6, 288, 1265, 2),  # 复位
    (7, 380, 1238, 2),  # 开始
    (8, 380, 1267, 2),  # 暂停
    (9, 481, 1271, 2),  # 声音
    (10, 575, 1271, 2),  # 开关
]
EM = 29.0  # высота иероглифа, пикселей фото


def legends_svg(z: zipfile.ZipFile) -> str:
    src = z.read("prince118/body/control-legends.svg").decode("utf-8")
    groups = re.findall(r'<g transform="translate\(([\d.]+) ([\d.]+)\) scale\(([\d.]+) -([\d.]+)\)" fill="#4d514f">(.*?)</g>', src, re.S)
    out = []
    for index, cx, cy, n in LABELS:
        _, _, _, _, body = groups[index]
        k = EM / 1000.0
        width = n * 1000 * k
        out.append(f'<g transform="translate({cx - width / 2:.1f} {cy + EM * 0.38:.1f}) scale({k:.5f} {-k:.5f})" fill="#4a4d45">{body}</g>')
    # стрелки поворота у большой кнопки (нижняя — верхняя, повёрнутая на 180° вокруг центра кнопки) и значок крестовины
    arrows = f"""
<g fill="none" stroke="#3f4540" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" opacity=".9">
<g id="turn"><path d="M527 1021Q509 1030 512 1054"/><path d="M503 1046 512 1058 521 1047"/></g>
<use href="#turn" transform="rotate(180 594 1093)"/></g>
<g fill="#3f4540" opacity=".9" transform="translate({PAD[0]} {PAD[1] - 10})"><circle r="3.2"/><path d="M-19 0 -9 -6V6Z"/><path d="M19 0 9 -6V6Z"/><path d="M0 -17 -6 -8H6Z"/><path d="M0 17 -6 8H6Z"/></g>
"""
    return "<g>" + "".join(out) + arrows + "</g>"


# ── корпус ────────────────────────────────────────────────────────────────────────────────────────────────────────
def scallops() -> str:
    """Тиснёная волна под малыми кнопками и «облака» по краям, как на корпусе оригинала."""
    d_low = ""
    x = 150.0
    while x + 94 < 735:
        d_low += f"M{x:.0f} 1338Q{x + 47:.0f} 1408 {x + 94:.0f} 1338"
        x += 94
    edges = "M128 1252Q150 1290 182 1262Q205 1240 232 1266M647 1262Q675 1236 700 1262Q724 1286 748 1250"
    both = (
        f'<path d="{d_low}" fill="none" stroke="#f8f0dc" stroke-width="7" opacity=".85" transform="translate(0 -2)"/>'
        f'<path d="{d_low}" fill="none" stroke="#bdaf8f" stroke-width="5" opacity=".75" transform="translate(0 3)"/>'
        f'<path d="{edges}" fill="none" stroke="#f8f0dc" stroke-width="6" opacity=".8"/>'
        f'<path d="{edges}" fill="none" stroke="#bdaf8f" stroke-width="4" opacity=".7" transform="translate(0 3)"/>'
    )
    return both


def lid_image_svg(panel_href: str) -> str:
    """Рамка передней панели: снимок оригинала целиком, масштаб и положение — `panel_xy`."""
    x, y = panel_xy(0, 0)
    return f'<image href="{panel_href}" x="{x:.2f}" y="{y:.2f}" width="{1448 * PANEL_SCALE:.2f}" height="{1086 * PANEL_SCALE:.2f}"/>'


def build_svg(z: zipfile.ZipFile, panel_href: str, *, lid_only: bool) -> str:
    """Корпус целиком (рамка + нижняя часть, кнопки отдельно) или только рамка для вида «только экран»."""
    g = GLASS
    x0, y0, x1, y1 = BODY_BOX
    defs = f"""<defs>
<linearGradient id="ivory" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#eadfc6"/><stop offset=".25" stop-color="#e5d9bf"/><stop offset=".7" stop-color="#ddd0b2"/><stop offset="1" stop-color="#cfc2a2"/></linearGradient>
<filter id="blur3" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3"/></filter>
<filter id="shadow" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="9"/></filter>
<filter id="lidshadow" x="-10%" y="-10%" width="120%" height="125%"><feGaussianBlur in="SourceAlpha" stdDeviation="7"/><feComponentTransfer><feFuncA type="linear" slope=".5"/></feComponentTransfer></filter>
<mask id="hole"><rect x="{x0}" y="{y0}" width="{x1 - x0}" height="{y1 - y0}" fill="#fff"/><rect x="{g['x']:.2f}" y="{g['y']:.2f}" width="{g['w']:.2f}" height="{g['h']:.2f}" fill="#000"/></mask>
</defs>"""
    lid = lid_image_svg(panel_href)
    if lid_only:
        body = f'<g transform="translate(0 6)" filter="url(#lidshadow)" opacity=".85">{lid}</g>{lid}'
    else:
        sticker_src = z.read("prince118/brand/sticker-prince.svg").decode("utf-8")
        sticker_inner = re.sub(r"^<svg[^>]*>|</svg>\s*$", "", sticker_src.strip(), flags=re.S)
        seats = "".join(key_seat_svg(n) for n in KEYS)
        body = f"""<!-- тень корпуса на подложке: нижняя часть и рамка -->
<g opacity=".3" filter="url(#shadow)" transform="translate(6 10)"><path d="{lower_body_path()}" fill="#000"/>{lid}</g>
<!-- нижняя часть корпуса -->
<path d="{lower_body_path()}" fill="url(#ivory)" stroke="#c4b896" stroke-width="3"/>
<path d="M{CX - 330:.0f} 1000Q{CX - 340:.0f} 1380 {CX - 336:.0f} 1700" fill="none" stroke="#f8f0dc" stroke-width="5" opacity=".7" transform="translate(7 0)"/>
<path d="M{CX + 330:.0f} 1000Q{CX + 340:.0f} 1380 {CX + 336:.0f} 1700" fill="none" stroke="#b3a684" stroke-width="5" opacity=".5" transform="translate(-7 0)"/>
{scallops()}
<!-- гнёзда кнопок -->
{seats}
<!-- тень рамки на нижнюю часть и сама рамка (снимок передней панели оригинала) -->
<g transform="translate(0 7)" filter="url(#lidshadow)">{lid}</g>
{lid}
<!-- подписи кнопок -->
{legends_svg(z)}
<!-- наклейка -->
<g transform="translate(143 1430) scale(1.06)">{sticker_inner}</g>"""
    return f"""<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="{(x1 - x0) * SCALE:.0f}" height="{(y1 - y0) * SCALE:.0f}" viewBox="{x0} {y0} {x1 - x0} {y1 - y0}">
{defs}
<g mask="url(#hole)">
{body}
</g>
</svg>"""



NODE_RENDER = r"""
const { chromium } = require(process.argv[2]);
const fs = require('fs');
(async () => {
  const [, , , svgPath, pngPath, w, h] = process.argv;
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
  await page.goto('file://' + svgPath);
  await page.waitForTimeout(400);
  await page.screenshot({ path: pngPath, omitBackground: true });
  await browser.close();
})();
"""


def render(svg: str, tmp: Path, name: str, w: int, h: int) -> Path:
    svg_path = tmp / f"{name}.svg"
    svg_path.write_text(svg, encoding="utf-8")
    js = tmp / "render.cjs"
    js.write_text(NODE_RENDER, encoding="utf-8")
    png = tmp / f"{name}.png"
    subprocess.run(["node", str(js), str(ROOT / "node_modules/playwright"), str(svg_path), str(png), str(w), str(h)], check=True)
    return png


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "keys").mkdir(exist_ok=True)
    layout: dict = {}
    x0, y0, x1, y1 = BODY_BOX
    w, h = round((x1 - x0) * SCALE), round((y1 - y0) * SCALE)
    with zipfile.ZipFile(ZIP) as z, tempfile.TemporaryDirectory(prefix="prince-") as t:
        tmp = Path(t)
        panel_png = tmp / "panel.png"
        Image.open(PANEL).convert("RGBA").save(panel_png)
        href = panel_png.as_uri()
        full = Image.open(render(build_svg(z, href, lid_only=False), tmp, "body", w, h)).convert("RGBA")
        alpha_box = full.getchannel("A").point(lambda v: 255 if v > 40 else 0).getbbox()
        assert alpha_box, "корпус не нарисован"
        pad = 6
        crop = (max(0, alpha_box[0] - pad), max(0, alpha_box[1] - pad), min(w, alpha_box[2] + pad), min(h, alpha_box[3] + pad))
        body = full.crop(crop)
        body.save(OUT / "body.webp", "WEBP", quality=92, method=6)
        # рамка отдельно (вид «только экран»): те же левый край, ширина и верх, что у корпуса, но обрезана по низу рамки с запасом на тень
        lid_full = Image.open(render(build_svg(z, href, lid_only=True), tmp, "lid", w, h)).convert("RGBA")
        lid_bottom_px = round((LID_BOTTOM - y0 + 14) * SCALE)
        lid = lid_full.crop((crop[0], crop[1], crop[2], min(h, lid_bottom_px)))
        lid.save(OUT / "lid.webp", "WEBP", quality=92, method=6)
        ox, oy = x0 + crop[0] / SCALE, y0 + crop[1] / SCALE
        W, H = body.width / SCALE, body.height / SCALE
        layout["body"] = dict(width=round(W, 1), height=round(H, 1), px=[body.width, body.height], origin=[round(ox, 1), round(oy, 1)])
        layout["screen"] = dict(x=round(GLASS["x"] - ox, 2), y=round(GLASS["y"] - oy, 2), w=round(GLASS["w"], 2), h=round(GLASS["h"], 2))
        layout["lid"] = dict(h=round(lid.height / SCALE, 1), px=[lid.width, lid.height])
        keys: dict = {}
        for name in KEYS:
            for pressed in (False, True):
                text, box = key_svg(name, pressed)
                (OUT / "keys" / f"{name}{'-pressed' if pressed else ''}.svg").write_text(text, encoding="utf-8")
                if not pressed:
                    clip = [[round((px - box["x"]) / box["w"] * 100, 2), round((py - box["y"]) / box["h"] * 100, 2)] for px, py in key_outline(KEYS[name])]
                    keys[name] = dict(x=round(box["x"] - ox, 1), y=round(box["y"] - oy, 1), w=round(box["w"], 1), h=round(box["h"], 1), kind=KEYS[name]["kind"], clip=clip)
        layout["keys"] = keys
        layout["pad"] = dict(cx=PAD[0] - ox, cy=PAD[1] - oy)
        sticker = Image.open(io.BytesIO(z.read("prince118/brand/sticker-prince.png"))).convert("RGBA")
        sticker = sticker.resize((540, round(540 * sticker.height / sticker.width)), Image.LANCZOS)
        sticker.save(OUT / "logo.webp", "WEBP", quality=90, method=6)
    LAYOUT.write_text(json.dumps(layout, ensure_ascii=False, indent=1), encoding="utf-8")
    print("готово:", OUT, "корпус", layout["body"], "рамка", layout["lid"])


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as error:
        sys.exit(error.returncode)
