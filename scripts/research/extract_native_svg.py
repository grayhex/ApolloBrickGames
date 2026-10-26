#!/usr/bin/env python3
"""Split CC0 BrickEmuPy faces into static housings and independently lit LCDs.

Usage: python scripts/research/extract_native_svg.py /path/to/BrickEmuPy
The input checkout should be revision 376cca92c6d000ffd6046e5491f2a1c3d1a5eab0.
"""
import copy
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

REVISION = '376cca92c6d000ffd6046e5491f2a1c3d1a5eab0'
NS = '{http://www.w3.org/2000/svg}'
ET.register_namespace('', NS[1:-1])
root = Path(sys.argv[1]).resolve()
revision = subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip()
if revision != REVISION:
    raise SystemExit(f'Expected BrickEmuPy {REVISION}, got {revision}')
output = Path(__file__).resolve().parents[2] / 'public' / 'devices'
for source, device in [('E23PlusMarkII96in1', 'e23'), ('Apollo18in1B0302', 'apollo-b0302')]:
    original = ET.parse(root / 'assets' / f'{source}.svg').getroot()
    housing = original.find(f'{NS}g[@id="body"]')
    display = original.find(f'{NS}g[@id="display"]')
    defs = original.find(f'{NS}defs')
    if housing is None or display is None or defs is None:
        raise SystemExit(f'Missing SVG layers: {source}')
    housing = copy.deepcopy(housing)
    frame = housing.find(f'{NS}*[@id="frame"]')
    if frame is None:
        raise SystemExit(f'Missing display frame: {source}')
    housing.remove(frame)
    for layer, children in [('body', [housing, copy.deepcopy(defs)]),
                            ('lcd', [frame, copy.deepcopy(display), copy.deepcopy(defs)])]:
        result = ET.Element(f'{NS}svg', original.attrib)
        result.extend(children)
        ET.ElementTree(result).write(output / f'{device}-{layer}.svg', encoding='unicode')
    marks, viewbox = ((['BRICK GAME', '96IN1'], '35 660 260 140') if device == 'e23'
                      else (['Vector 4'], '660 4665 1010 700'))
    mark = ET.Element(f'{NS}svg', {'viewBox': viewbox})
    mark.extend(copy.deepcopy(housing.find(f'{NS}*[@id="{name}"]')) for name in marks)
    mark.append(copy.deepcopy(defs))
    ET.ElementTree(mark).write(output.parent / 'brand' / f'{device}-wordmark.svg', encoding='unicode')
