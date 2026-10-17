#!/usr/bin/env python3
"""Game-over animation of the HT943 Tetris ROMs (E-23 Plus Mark II 96in1 and E88 8in1) in pinned BrickEmuPy; headless, no ROM redistribution.
Usage: python scripts/research/brickemu_gameover.py --upstream /path/to/BrickEmuPy --output /tmp/gameover.json
Method: boot, mute, start slot 1 (Tetris), hold Down until the well tops out; the first pass finds the moment the whole screen is lit,
the second pass replays to just before it and samples the LCD every millisecond of emulated time. Reported: when each row becomes full
(bottom to top) and when it goes dark again (top to bottom). Times are emulated milliseconds from the first full row.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys

REVISION = '376cca92c6d000ffd6046e5491f2a1c3d1a5eab0'
SCRIPT_DIR = Path(__file__).resolve().parent
LCD = [[tuple(map(int, item.split('_'))) for item in row] for row in json.loads((SCRIPT_DIR / 'e23-lcd.json').read_text())]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--upstream', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    output = args.output.resolve()
    root = args.upstream.resolve()
    revision = subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip()
    if revision != REVISION:
        raise SystemExit(f'Expected BrickEmuPy {REVISION}; found {revision}')
    os.chdir(root)
    sys.path.insert(0, str(root))
    from cores import cores_map
    from interconnect import Interconnect
    from peripherals.direct_input import DirectInput

    class Machine:
        def __init__(self, name):
            self.config = json.loads((Path('assets') / (name + '.brick')).read_text())
            self.cycles = 0
            self.bus = Interconnect(self)
            self.cpu = cores_map[self.config['core']]['core'](self.config['mask_options'], self.config['clock'], self.bus)
            self.keys = DirectInput(self.config['peripherals']['direct_input'], self.bus)

        def audio_handler(self, channel, data):
            pass

        def run(self, seconds):
            target = self.cycles + round(seconds * self.config['clock'])
            while self.cycles < target:
                elapsed = self.cpu.clock()
                self.cycles += elapsed
                self.bus.emit_clock(elapsed)

        def key(self, name, duration=.08, after=.12):
            self.bus.emit_input('btn' + name, True)
            self.run(duration)
            self.bus.emit_input('btn' + name, False)
            self.run(after)

        def rows(self):
            vram = self.cpu.get_VRAM()
            return [sum(1 for address, bit in row if vram[address] & (1 << bit)) for row in LCD]

    def boot(name):
        machine = Machine(name)
        machine.run(3)
        machine.key('Mute')
        machine.key('Start')
        machine.run(2)
        machine.bus.emit_input('btnDown', True)
        return machine

    result = {'reference': {'repository': 'https://github.com/azya52/BrickEmuPy', 'revision': REVISION}, 'devices': {}}
    for name in ['E23PlusMarkII96in1', 'E88_8in1']:
        machine = boot(name)
        elapsed = 0.0
        full_at = None
        while elapsed < 120 and full_at is None:
            machine.run(.01)
            elapsed += .01
            if sum(machine.rows()) == 200:
                full_at = elapsed
        assert full_at is not None, name
        machine = boot(name)
        elapsed = 0.0
        while elapsed < full_at - 3.2:
            machine.run(.01)
            elapsed += .01
        origin = None
        filled = {}
        cleared = {}
        for _ in range(8000):
            machine.run(.001)
            elapsed += .001
            rows = machine.rows()
            for y, n in enumerate(rows):
                if n == 10 and y not in filled and (y == 19 or y + 1 in filled):
                    filled[y] = elapsed
                if filled.get(0) is not None and n == 0 and y not in cleared and (y == 0 or y - 1 in cleared):
                    cleared[y] = elapsed
            if len(cleared) == 20:
                break
        assert len(filled) == 20 and len(cleared) == 20, (name, len(filled), len(cleared))
        origin = filled[19]
        result['devices'][name] = {
            'rowFilledMs': [round((filled[y] - origin) * 1000) for y in range(19, -1, -1)],
            'rowClearedMs': [round((cleared[y] - origin) * 1000) for y in range(20)],
        }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2) + '\n')
    print(f'Wrote {output}', file=sys.stderr)


if __name__ == '__main__':
    main()
