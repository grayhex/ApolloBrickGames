#!/usr/bin/env python3
"""Headless, cycle-based observations of pinned BrickEmuPy; no Qt or ROM redistribution.
Usage: python scripts/research/brickemu_probe.py --upstream /path/to/BrickEmuPy --output /tmp/observations.json
The only constructed states are the explicitly labelled line-clear/progression wells.
"""
import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import statistics
import subprocess
import sys

REVISION = '376cca92c6d000ffd6046e5491f2a1c3d1a5eab0'
SCRIPT_DIR = Path(__file__).resolve().parent
def lcd_map(name):
    return [[tuple(map(int, item.split('_'))) for item in row] for row in json.loads((SCRIPT_DIR / name).read_text())]

LCD = lcd_map('b0202-lcd.json')
E23_LCD = lcd_map('e23-lcd.json')


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
    if subprocess.check_output(['git', '-C', str(root), 'status', '--porcelain'], text=True).strip():
        raise SystemExit('Reference checkout must be clean')
    os.chdir(root)
    sys.path.insert(0, str(root))
    from cores import cores_map
    from interconnect import Interconnect
    from peripherals.direct_input import DirectInput

    class Machine:
        def __init__(self, name='Apollo126in1B0202'):
            self.config = json.loads((Path('assets') / (name + '.brick')).read_text())
            self.lcd = LCD if name == 'Apollo126in1B0202' else E23_LCD
            self.cycles = 0
            self.audio = []
            self.inputs = []
            self.bus = Interconnect(self)
            self.cpu = cores_map[self.config['core']]['core'](self.config['mask_options'], self.config['clock'], self.bus)
            self.keys = DirectInput(self.config['peripherals']['direct_input'], self.bus)

        def audio_handler(self, channel, data):
            self.audio.append((self.cycles, channel, data))

        def run(self, seconds):
            target = self.cycles + round(seconds * self.config['clock'])
            while self.cycles < target:
                elapsed = self.cpu.clock()
                self.cycles += elapsed
                self.bus.emit_clock(elapsed)

        def key(self, name, duration=.08, after=.12):
            self.set_key(name, True)
            self.run(duration)
            self.set_key(name, False)
            self.run(after)

        def set_key(self, name, down):
            self.inputs.append([self.cycles, name, down])
            self.bus.emit_input('btn' + name, down)

        def ram(self, address):
            return self.cpu._RAM[address - 0x30]

        def cells(self):
            vram = self.cpu.get_VRAM()
            return [(x, y) for y, row in enumerate(self.lcd) for x, (address, bit) in enumerate(row) if vram[address] & (1 << bit)]

        def score(self):
            return sum(self.ram(0x82 + i) * 10 ** i for i in range(4))

    def menu(speed=0):
        machine = Machine()
        machine.run(3)
        for _ in range(7):  # A -> H, Right+Down also advances the speed register.
            machine.set_key('Right', True)
            machine.key('Down')
            machine.set_key('Right', False)
            machine.run(.1)
        for _ in range((speed - 7) % 10):
            machine.key('Right')
        assert machine.ram(0x70) == speed
        machine.key('Mute')
        return machine

    inventory = []
    for name in ['Apollo126in1B0202', 'Apollo18in1B0302', 'E23PlusMarkII96in1', 'E88_8in1', 'E33_2in1', 'GA888', 'Keychain55in1', 'GA878', 'MiconKC32', 'RadioShackStackChallenge']:
        config_path = Path('assets') / (name + '.brick')
        config = json.loads(config_path.read_text())
        rom_path = Path(config['mask_options']['rom_path'])
        inventory.append({'device': name, 'core': config['core'], 'clockHz': config['clock'], 'romSha256': hashlib.sha256(rom_path.read_bytes()).hexdigest(), 'configSha256': hashlib.sha256(config_path.read_bytes()).hexdigest()})

    rom = Path('assets/Apollo126in1B0202.bin').read_bytes()
    counts = list(rom[0xC38:0xC42])
    result = {'reference': {'repository': 'https://github.com/azya52/BrickEmuPy', 'revision': revision, 'devices': inventory}, 'b0202': {'timerCycles': 2048, 'gravityTableAddress': '0x0C38', 'gravityCounts': counts}}
    observations = result['b0202']
    gravity = []
    for speed in range(10):
        machine = menu(speed)
        machine.key('StartP')
        start = machine.cycles
        previous = None
        drops = []
        for _ in range(350):
            machine.run(.01)
            cells = machine.cells()
            if len(cells) == 4 and max(y for _, y in cells) < 17:
                if previous and cells == [(x, y + 1) for x, y in previous]:
                    drops.append(machine.cycles - start)
                previous = cells
        assert len(drops) >= 3, (speed, drops)
        measured = statistics.median(b - a for a, b in zip(drops, drops[1:]))
        assert abs(measured - counts[speed] * 2048) <= 7000  # 10 ms display sampling, not wall time.
        gravity.append({'speedDigit': speed, 'fallCycles': drops, 'medianPeriodMs': round(measured / 690, 3)})
    observations['gravity'] = gravity

    # Reach a vertical I using ordinary input and a fixed boot/start delay, without patching a ROM.
    template = menu()
    template.run(.15)
    template.key('StartP')
    template.run(1.6)
    template.key('Rotate')
    assert len(template.cells()) == 4 and len({x for x, _ in template.cells()}) == 1
    observations['wellSetup'] = {'description': 'Inject bottom rows with a vertical I-shaped gap into LCD RAM; set decimal score digits only for boundary cases. ROM, CPU clock and gameplay code stay unchanged.', 'inputs': template.inputs, 'initialCells': template.cells()}
    clears = []
    for rows, score, speed in [(1, 0, 0), (2, 0, 0), (3, 0, 0), (4, 0, 0), (1, 99, 0), (1, 999, 0), (1, 999, 9)]:
        machine = copy.deepcopy(template)
        gap = machine.cells()[0][0]
        for i in range(4):
            machine.cpu._RAM[0x82 - 0x30 + i] = score // 10 ** i % 10
        machine.cpu._RAM[0x70 - 0x30] = speed
        for row in LCD[20 - rows:]:
            for x, (address, bit) in enumerate(row):
                if x != gap:
                    machine.cpu._LCDRAM[address] |= 1 << bit
                else:
                    machine.cpu._LCDRAM[address] &= ~(1 << bit)
        machine.key('Down', 1, .1)
        machine.run(2)
        clears.append({'rows': rows, 'beforeScore': score, 'afterScore': machine.score(), 'beforeSpeedDigit': speed, 'afterSpeedDigit': machine.ram(0x70)})
    observations['clears'] = clears

    # Re-enable effects after starting muted, so background music does not contaminate effect traces.
    machine = menu()
    machine.key('StartP')
    machine.run(2)
    machine.key('Mute')
    machine.run(.8)
    effects = {}
    for key in ['Left', 'Rotate', 'Down']:
        probe = copy.deepcopy(machine)
        probe.audio = []
        start = probe.cycles
        probe.key(key, .06, .5)
        commands = []
        for i, (cycle, channel, data) in enumerate(probe.audio):
            following = next((c for c, ch, _ in probe.audio[i + 1:] if ch == channel), cycle + 690000)
            # SPL writes frequency low/high registers separately: discard states shorter than 0.1 ms.
            if following - cycle >= 69 and channel != 3:
                commands.append({'cycle': cycle - start, 'channel': channel, 'tone': data})
        effects[key] = commands
    observations['effects'] = effects
    holds = {}
    for key in ['Left', 'Right', 'Rotate', 'Down']:
        probe = copy.deepcopy(machine)
        start = probe.cycles
        changes = [{'cycle': 0, 'cells': probe.cells()}]
        probe.set_key(key, True)
        for _ in range(120):
            probe.run(.005)
            cells = probe.cells()
            if cells != changes[-1]['cells']:
                changes.append({'cycle': probe.cycles - start, 'cells': cells})
        holds[key] = changes
    observations['heldInput'] = {'durationMs': 600, 'samplingMs': 5, 'changes': holds}

    # Catalogue observations on the other 10x20 HT943 firmwares; these are not
    # proof of identical rules to games with similar names in our catalogue.
    other = []
    for name, slots in [('E23PlusMarkII96in1', [1, 9, 17, 25, 33, 41, 49, 57, 65, 73, 81, 89, 91, 92, 93, 94, 95, 96]), ('E88_8in1', range(1, 9))]:
        base = Machine(name)
        base.run(3)
        base.key('Mute')
        current = 1
        games = []
        for slot in slots:
            while current < slot:
                base.key('Down')
                current += 1
            probe = copy.deepcopy(base)
            probe.key('Start')
            probe.run(2)
            before = probe.cells()
            probe.key('Rotate', .6, .2)
            games.append({'slot': slot, 'afterStartCells': before, 'afterRotateCells': probe.cells()})
        other.append({'device': name, 'procedure': 'Boot 3s, Mute, Down to slot, Start, wait 2s, hold Rotate 600ms, release 200ms. E88 uses the same LCD RAM mapping as E23.', 'games': games})
    result['otherDevices'] = other
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2) + '\n')
    print(f'Wrote {output}', file=sys.stderr)


if __name__ == '__main__':
    main()
