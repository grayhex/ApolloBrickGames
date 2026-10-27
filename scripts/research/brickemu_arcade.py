#!/usr/bin/env python3
"""Cycle-based Brick Game ROM inventory, Snake and Dice observations; no Qt/ROM copies.
Run with --upstream a clean pinned BrickEmuPy checkout --output /tmp/rom-arcade.json.
--section inventory also executes the ten devices and records their boot/launch frames.
Constructed states are explicitly labelled in Dice, Frog and Beetle observations.
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
HERE = Path(__file__).resolve().parent
NAMES = ['Apollo126in1B0202', 'Apollo18in1B0302', 'E23PlusMarkII96in1', 'E88_8in1', 'E33_2in1', 'GA888', 'Keychain55in1', 'GA878', 'MiconKC32', 'RadioShackStackChallenge']


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--upstream', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--speed', type=int, help='Limit the B0302 gravity probe to this number of RIGHT presses')
    parser.add_argument('--section', choices=['all', 'inventory', 'snake', 'dice', 'audio', 'frog', 'beetle', 'catalog', 'native-menus', 'b0302-gravity', 'b0302-debug', 'b0302-audio', 'b0302-racing', 'b0302-race-timeline', 'b0302-race-score', 'b0302-shooting', 'b0302-shooting-life', 'b0302-pieces', 'b0302-variants', 'b0302-inputs', 'e23-variants', 'e23-arcade', 'e23-array-life', 'e23-actions', 'e23-gravity', 'e23-speeds'], default='all')
    args = parser.parse_args()
    root, output = args.upstream.resolve(), args.output.resolve()
    if subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip() != REVISION:
        raise SystemExit(f'Expected BrickEmuPy {REVISION}')
    if subprocess.check_output(['git', '-C', str(root), 'status', '--porcelain'], text=True).strip():
        raise SystemExit('Reference checkout must be clean')
    maps = json.loads((HERE / 'device-lcd.json').read_text())
    maps['Apollo126in1B0202'] = json.loads((HERE / 'b0202-lcd.json').read_text())
    maps['E23PlusMarkII96in1'] = maps['E88_8in1'] = json.loads((HERE / 'e23-lcd.json').read_text())
    os.chdir(root)
    sys.path.insert(0, str(root))
    from cores import cores_map
    from interconnect import Interconnect
    from peripherals.direct_input import DirectInput
    from cores.HT4BITsound import HT4BITsound

    class Machine:
        def __init__(self, name):
            self.name = name
            self.config = json.loads(Path(f'assets/{name}.brick').read_text())
            self.cycles, self.audio, self.inputs = 0, [], []
            self.bus = Interconnect(self)
            self.cpu = cores_map[self.config['core']]['core'](self.config['mask_options'], self.config['clock'], self.bus)
            self.keys = DirectInput(self.config['peripherals']['direct_input'], self.bus)

        def audio_handler(self, channel, data):
            self.audio.append({'cycle': self.cycles, 'channel': channel, 'tone': data})

        def run(self, seconds):
            target = self.cycles + round(seconds * self.config['clock'])
            while self.cycles < target:
                elapsed = self.cpu.clock()
                self.cycles += elapsed
                self.bus.emit_clock(elapsed)

        def set_key(self, name, pressed):
            self.inputs.append([self.cycles, name, pressed])
            self.bus.emit_input('btn' + name, pressed)

        def key(self, name, duration=.08, after=.12):
            self.set_key(name, True)
            self.run(duration)
            self.set_key(name, False)
            self.run(after)

        def cells(self):
            vram = self.cpu.get_VRAM()
            return [[x, y] for y, row in enumerate(maps[self.name]) for x, segment in enumerate(row)
                    if vram[int(segment.split('_')[0])] & (1 << int(segment.split('_')[1]))]

    devices = []
    for name in NAMES:
        config = json.loads(Path(f'assets/{name}.brick').read_text())
        devices.append({'device': name, 'core': config['core'], 'clockHz': config['clock'],
                        'matrix': [len(maps[name][0]), len(maps[name])],
                        'romSha256': hashlib.sha256(Path(config['mask_options']['rom_path']).read_bytes()).hexdigest(),
                        'faceSha256': hashlib.sha256(Path(config['face_path']).read_bytes()).hexdigest()})
    result = {'reference': {'repository': 'https://github.com/azya52/BrickEmuPy', 'revision': REVISION, 'devices': devices}}

    if args.section == 'b0302-variants':
        base = Machine('Apollo18in1B0302')
        base.run(8)
        result['variants'] = []
        for slot in range(1, 19):
            probe = copy.deepcopy(base)
            probe.key('Mute')
            probe.key('StartP', .2, .3)
            probe.run(4)
            sample = {'slot':slot, 'cells':probe.cells(), 'ram':list(probe.cpu._RAM),
                      'cycle':probe.cycles, 'inputs':probe.inputs, 'timeline':[]}
            if slot >= 3:
                for _ in range(40):
                    probe.run(.1)
                    sample['timeline'].append({'cycle':probe.cycles,'cells':probe.cells()})
            result['variants'].append(sample)
            base.key('Down')

    if args.section == 'b0302-pieces':
        base=Machine('Apollo18in1B0302')
        base.run(8)
        result['pieces']=[]
        for slot in range(1,17):
            if slot>=3:
                samples=[]
                for delay in (0,.15,.3,.45):
                    probe=copy.deepcopy(base)
                    probe.key('Mute')
                    if delay:probe.run(delay)
                    probe.key('StartP',.2,.3)
                    if delay:
                        probe.run(1)
                        probe.key('StartP',.2,.3)
                    probe.run(3)
                    samples.append({'delay':delay,'cells':probe.cells(),'cycle':probe.cycles})
                result['pieces'].append({'slot':slot,'samples':samples})
            base.key('Down')

    if args.section == 'b0302-racing':
        base = Machine('Apollo18in1B0302')
        base.run(8)
        result['race'] = []
        for slot in (1, 2):
            machine = copy.deepcopy(base)
            machine.key('Mute')
            machine.key('StartP', .2, .3)
            machine.run(4)
            observations = [{'action': 'none', 'cells': machine.cells(), 'cycles': machine.cycles}]
            for action in ('Left', 'Left', 'Right', 'Right', 'Rotate', 'Down'):
                machine.key(action, .2, .3)
                observations.append({'action': action, 'cells': machine.cells(), 'cycles': machine.cycles})
            result['race'].append({'slot': slot, 'frames': observations, 'inputs': machine.inputs})
            base.key('Down')

    if args.section == 'b0302-race-timeline':
        base = Machine('Apollo18in1B0302')
        base.run(8)
        result['races'] = []
        for slot in (1, 2):
            machine = copy.deepcopy(base)
            machine.key('Mute')
            machine.key('StartP', .2, .3)
            frames = []
            for _ in range(50):
                machine.run(.5)
                frames.append({'cycle':machine.cycles,'cells':machine.cells(),'vram':list(machine.cpu.get_VRAM())})
            result['races'].append({'slot':slot,'frames':frames,'inputs':machine.inputs})
            base.key('Down')

    if args.section == 'b0302-race-score':
        machine = Machine('Apollo18in1B0302')
        machine.run(8)
        machine.key('Mute')
        machine.key('StartP', .2, .3)
        frames, previous = [], None
        for _ in range(1600):
            machine.run(.005)
            vram = list(machine.cpu.get_VRAM())
            # Preserve raw display samples; decoding the score separately keeps
            # transient multiplexed frames distinguishable from stable digits.
            if vram != previous:
                frames.append({'cycle':machine.cycles,'cells':machine.cells(),'vram':vram})
            previous = vram
        result['scoreFrames'] = frames

    if args.section == 'b0302-shooting':
        base = Machine('Apollo18in1B0302')
        base.run(8)
        for _ in range(16):
            base.key('Down')
        result['shooting'] = []
        for slot in (17,18):
            machine = copy.deepcopy(base)
            machine.key('Mute')
            machine.key('StartP', .2, .3)
            machine.run(4)
            trials=[]
            for action in ('none','Rotate'):
                probe=copy.deepcopy(machine)
                if action=='Rotate':probe.set_key('Rotate',True)
                frames=[]
                for i in range(120):
                    probe.run(.01)
                    if i==9 and action=='Rotate':probe.set_key('Rotate',False)
                    frames.append({'cycle':probe.cycles,'cells':probe.cells(),'vram':list(probe.cpu.get_VRAM())})
                trials.append({'action':action,'frames':frames})
            result['shooting'].append({'slot':slot,'trials':trials,'inputs':machine.inputs})
            base.key('Down')

    if args.section == 'b0302-shooting-life':
        base=Machine('Apollo18in1B0302')
        base.run(8)
        for _ in range(16):base.key('Down')
        result['shootingLife']=[]
        for slot in (17,18):
            machine=copy.deepcopy(base)
            machine.key('Mute')
            machine.key('StartP',.2,.3)
            frames=[]
            for _ in range(120):
                machine.run(.25)
                frames.append({'cycle':machine.cycles,'cells':machine.cells(),'vram':list(machine.cpu.get_VRAM())})
            result['shootingLife'].append({'slot':slot,'frames':frames})
            base.key('Down')

    if args.section == 'b0302-inputs':
        base = Machine('Apollo18in1B0302')
        base.run(8)
        result['inputs'] = []
        for slot in range(1, 5):
            if slot in (3, 4):
                machine = copy.deepcopy(base)
                machine.key('Mute')
                machine.key('StartP', .2, .3)
                machine.run(3)
                for key in ('none', 'Down', 'Rotate'):
                    probe = copy.deepcopy(machine)
                    before = probe.cells()
                    if key == 'none':
                        probe.run(.4)
                    else:
                        probe.key(key, .4, 0)
                    result['inputs'].append({'slot': slot, 'key': key, 'before': before,
                                             'after': probe.cells(), 'cycles': probe.cycles})
            base.key('Down')

    if args.section == 'b0302-audio':
        machine = Machine('Apollo18in1B0302')
        machine.run(8)
        machine.key('Down')
        machine.key('Down')
        machine.key('StartP', .2, .3)
        machine.run(8)
        result['audio'] = []
        for key in ('none', 'Left', 'Rotate', 'Down'):
            probe = copy.deepcopy(machine)
            probe.audio.clear()
            start = probe.cycles
            if key == 'none':
                probe.run(.6)
            else:
                probe.key(key, .2, .4)
            result['audio'].append({'key':key,'start':start,'before':machine.cells(),'after':probe.cells(),'events':probe.audio})

    if args.section == 'e23-variants':
        base = Machine('E23PlusMarkII96in1')
        base.run(3)
        base.key('Mute')
        result['variants'] = []
        for slot in range(1, 100):
            probe = copy.deepcopy(base)
            probe.key('Start', .08, .12)
            probe.run(2)
            result['variants'].append({'slot': slot, 'cells': probe.cells(),
                                       'ram': list(probe.cpu._RAM), 'cycle': probe.cycles})
            base.key('Down')

    if args.section == 'e23-arcade':
        result['arcade'] = []
        for name in ('E23PlusMarkII96in1','E88_8in1'):
            base=Machine(name)
            base.run(3)
            base.key('Mute')
            for _ in range(5):base.key('Down')
            for slot in (6,7,8):
                machine=copy.deepcopy(base)
                machine.key('Start',.08,.12)
                frames=[]
                for _ in range(16):
                    machine.run(.5)
                    frames.append({'cycle':machine.cycles,'cells':machine.cells()})
                result['arcade'].append({'device':name,'slot':slot,'frames':frames,'inputs':machine.inputs})
                base.key('Down')

    if args.section == 'e23-actions':
        machine=Machine('E23PlusMarkII96in1')
        machine.run(3)
        machine.key('Mute')
        for _ in range(5):machine.key('Down')
        machine.key('Start',.08,.12)
        machine.run(2.5)
        result['actions']=[]
        for action,duration in (('none',0),('Left',.1),('Rotate',.1),('Rotate',.2),('Rotate',.3),('Rotate',.4),('Rotate',.6),('Rotate',1),('Down',.1)):
            probe=copy.deepcopy(machine)
            if action!='none':probe.set_key(action,True)
            frames=[]
            for i in range(160):
                probe.run(.01)
                if action!='none' and i+1==round(duration*100):probe.set_key(action,False)
                frames.append({'cycle':probe.cycles,'cells':probe.cells(),'vram':list(probe.cpu.get_VRAM())})
            result['actions'].append({'action':action,'duration':duration,'frames':frames})

    if args.section == 'e23-array-life':
        machine=Machine('E23PlusMarkII96in1')
        machine.run(3)
        machine.key('Mute')
        for _ in range(5):machine.key('Down')
        machine.key('Start',.08,.12)
        result['arrayLife']=[]
        for _ in range(60):
            machine.run(.5)
            result['arrayLife'].append({'cycle':machine.cycles,'cells':machine.cells(),
                                       'vram':list(machine.cpu.get_VRAM())})

    if args.section == 'e23-gravity':
        result['gravity'] = []
        for name in ('E23PlusMarkII96in1', 'E88_8in1'):
            machine = Machine(name)
            machine.run(3)
            machine.key('Mute')
            machine.key('Start', .08, .12)
            previous, full_cycle, deltas = None, None, []
            for _ in range(1000):
                machine.run(.005)
                cells = machine.cells()
                if len(cells) != 4 or cells == previous:
                    continue
                if previous is not None and cells == [[x, y+1] for x,y in previous]:
                    deltas.append(machine.cycles-full_cycle)
                previous, full_cycle = cells, machine.cycles
            result['gravity'].append({'device':name, 'intervalCycles':deltas, 'inputs':machine.inputs})

    if args.section == 'e23-speeds':
        base = Machine('E23PlusMarkII96in1')
        base.run(3)
        base.key('Mute')
        result['speeds'] = []
        for speed in range(10):
            machine = copy.deepcopy(base)
            for _ in range(speed):
                machine.key('Right')
            machine.key('Start', .08, .12)
            previous, full_cycle, deltas = None, None, []
            for _ in range(1500):
                machine.run(.002)
                cells = machine.cells()
                if len(cells) != 4 or cells == previous:
                    continue
                if previous is not None and cells == [[x, y+1] for x,y in previous]:
                    deltas.append(machine.cycles-full_cycle)
                previous, full_cycle = cells, machine.cycles
            result['speeds'].append({'speed':speed, 'intervalCycles':deltas, 'inputs':machine.inputs})

    if args.section == 'b0302-gravity':
        base = Machine('Apollo18in1B0302')
        base.run(8)
        for _ in range(2):
            base.key('Down')
        observations = []
        for speed in ([args.speed] if args.speed is not None else range(11)):
            machine = copy.deepcopy(base)
            machine.key('Mute')
            for _ in range(speed):
                machine.key('Right')
            # Allow the firmware's key feedback to finish before START; an
            # immediate press can be consumed while the menu is still busy.
            if speed:
                machine.run(1)
            menu_cells = machine.cells()
            menu_vram = list(machine.cpu.get_VRAM())
            machine.key('StartP', .2, .3)
            # After changing speed the first START leaves the settings screen;
            # the next starts the game (observed with b0302-debug).
            if speed:
                machine.run(1)
                machine.key('StartP', .2, .3)
            after_start = machine.cells()
            previous, full_previous, full_cycle, deltas, changes = None, None, None, [], []
            for _ in range(800):
                machine.run(.005)
                cells = machine.cells()
                if cells == previous:
                    continue
                if len(changes) < 24:
                    changes.append({'cycle': machine.cycles, 'cells': cells})
                if len(cells) == 4 and cells != full_previous:
                    if full_previous is not None and cells == [[x, y + 1] for x, y in full_previous]:
                        deltas.append(machine.cycles - full_cycle)
                    full_previous, full_cycle = cells, machine.cycles
                previous = cells
            observations.append({'speed': speed, 'intervalCycles': deltas, 'menu': menu_cells, 'menuVram':menu_vram,
                                 'afterStart': after_start, 'changes': changes, 'inputs': machine.inputs})
        result['gravity'] = observations

    if args.section == 'b0302-debug':
        base = Machine('Apollo18in1B0302')
        base.run(8)
        base.key('Down')
        base.key('Down')
        result['debug'] = []
        for trial in (0,1,2):
            machine = copy.deepcopy(base)
            machine.key('Mute')
            if trial:
                machine.key('Right')
                machine.run(1)
            machine.key('StartP', .2, .3)
            if trial == 2:
                machine.run(1)
                machine.key('StartP', .2, .3)
            frames = []
            for _ in range(12):
                machine.run(.5)
                cpu = machine.cpu.examine()
                frames.append({'cycle':machine.cycles,'pc':cpu['PC'], 'cells':machine.cells(),
                               'lcd':list(cpu['LCDRAM']), 'io':list(cpu['IORAM'])})
            result['debug'].append({'trial':trial,'inputs':machine.inputs,'frames':frames})

    if args.section == 'native-menus':
        result['menus'] = {}
        for name, count in [('E23PlusMarkII96in1', 96), ('Apollo18in1B0302', 18)]:
            machine = Machine(name)
            machine.run(8)
            machine.key('Mute')
            # On B0302 the first DOWN dismisses the startup screen instead of
            # advancing the selected game. Begin observation in the menu.
            if name == 'Apollo18in1B0302':
                machine.key('Down')
            frames = []
            for slot in range(1, count + 1):
                frames.append({'slot': slot, 'cells': machine.cells(), 'cycles': machine.cycles})
                machine.key('Down')
            following = []
            extra_games = []
            for _ in range(4):
                following.append(machine.cells())
                if name == 'E23PlusMarkII96in1' and len(following) <= 3:
                    probe = copy.deepcopy(machine)
                    probe.key('Start', .2, .3)
                    probe.run(4)
                    before = probe.cells()
                    probe.key('Rotate', .2, .3)
                    extra_games.append({'slot': 96 + len(following), 'beforeRotate': before,
                                        'afterRotate': probe.cells(), 'inputs': probe.inputs})
                machine.key('Down')
            result['menus'][name] = {'frames': frames, 'following': following,
                                      'extraGames': extra_games, 'inputs': machine.inputs}

    if args.section == 'inventory':
        starts = dict(zip(NAMES, ['StartP', 'StartP', 'Start', 'Start', 'Start', 'Rotate', 'StartRotate', 'OnPause', 'StartPause', 'OnOff']))
        result['launches'] = []
        for name in NAMES:
            machine = Machine(name)
            machine.run(8)
            boot = machine.cells()
            machine.key(starts[name], .2, .3)
            machine.run(3)
            result['launches'].append({'device': name, 'inputs': machine.inputs, 'boot': boot, 'afterLaunch': machine.cells()})
        # GUI labels/boot images alone do not identify rules. The additional traces below identify Snake.

    if args.section in ['all', 'catalog']:
        result['catalog'] = {'b0302': [], 'fallingBlocks': [], 'keychainSnake': []}
        base = Machine('Apollo18in1B0302')
        base.run(8)
        for slot in range(1, 19):
            probe = copy.deepcopy(base)
            probe.key('Mute')
            probe.key('StartP', .2, .3)
            probe.run(4)
            before = probe.cells()
            probe.key('Rotate', .2, .3)
            result['catalog']['b0302'].append({'slot': slot, 'inputs': probe.inputs, 'beforeRotate': before, 'afterRotate': probe.cells()})
            base.key('Down')
        for name in ['E33_2in1', 'GA888', 'Keychain55in1', 'GA878', 'MiconKC32', 'RadioShackStackChallenge']:
            probe = Machine(name)
            probe.run(8)
            if name == 'Keychain55in1':
                probe.key('OnPause')
                probe.run(.3)
                for _ in range(42):
                    probe.key('Down')
            if name == 'RadioShackStackChallenge':
                probe.key('OnOff')
                probe.run(6)
            key = {'E33_2in1':'Start','GA888':'Rotate','Keychain55in1':'StartRotate','GA878':'OnPause','MiconKC32':'StartPause','RadioShackStackChallenge':'Down'}[name]
            probe.key(key, .2, .3)
            start, previous, falls, changes = probe.cycles, None, [], []
            for _ in range(1600):
                probe.run(.005)
                cells = probe.cells()
                if len(cells) == 4:
                    if previous and cells == [[x,y+1] for x,y in previous]:
                        falls.append(probe.cycles-start)
                    if cells != previous:
                        changes.append({'cycle':probe.cycles-start,'cells':cells})
                        previous = cells
            result['catalog']['fallingBlocks'].append({'device':name,'inputs':probe.inputs,'fallCycles':falls,'changes':changes,'lastFrame':probe.cells()})
        # Keychain slot 01: three-cell body at the bottom, food blinks above;
        # natural movement along the bottom ends in its original crash scene.
        probe = Machine('Keychain55in1')
        probe.run(3)
        probe.key('OnPause', .2, .3)
        probe.key('StartRotate', .2, .3)
        probe.run(2)
        for _ in range(50):
            probe.run(.1)
            result['catalog']['keychainSnake'].append({'cycle':probe.cycles,'cells':probe.cells()})

    if args.section in ['all', 'snake']:
        result['snake'] = {}
        for name, slot in [('E88_8in1', 5), ('E23PlusMarkII96in1', 93)]:
            base = Machine(name)
            base.run(3)
            base.key('Mute')
            for _ in range(slot - 1):
                base.key('Down')
            speeds = []
            for speed in range(10):
                machine = copy.deepcopy(base)
                for _ in range(speed):
                    machine.key('Right')
                # Hold UP before START so speed 9 cannot die at the right edge before the first input.
                machine.set_key('Rotate', True)
                machine.key('Start', .08, 0)
                machine.run(.05)
                machine.set_key('Rotate', False)
                start, last, changes = machine.cycles, None, []
                for _ in range(5000):
                    machine.run(.001)
                    ram = machine.cpu._RAM
                    head = [ram[0x30], ram[0x31] + 16 * ram[0x32]]
                    if head != last:
                        changes.append({'cycle': machine.cycles - start, 'head': head})
                        last = head
                    if head[1] >= 12 or head[0] >= 10:
                        break
                delta = [b['cycle'] - a['cycle'] for a, b in zip(changes[1:], changes[2:])]
                assert len(delta) >= 5, (name, speed, changes)
                speeds.append({'speedDigit': speed, 'headChanges': changes, 'medianPeriodMs': statistics.median(delta) / 1000})
            result['snake'][name] = {'speeds': speeds}

    if args.section in ['all', 'frog']:
        machine = Machine('Apollo126in1B0202')
        machine.run(3)
        machine.key('Mute')
        machine.key('StartP')
        start, pending, groups = machine.cycles, False, []
        limit = start + 6_000_000
        while machine.cycles < limit:
            pc = machine.cpu._get_pc()
            if pc == 0x2320:
                pending, at = True, machine.cycles
            if pending and pc == 0x23D1:
                groups.append({'cycle': at - start, 'cells': machine.cells()})
                pending = False
            elapsed = machine.cpu.clock()
            machine.cycles += elapsed
            machine.bus.emit_clock(elapsed)
        base = Machine('Apollo126in1B0202')
        base.run(3)
        base.key('Mute')
        base.key('StartP')
        base.run(.1)
        moves = []
        for key in ['Rotate', 'Rotate', 'Left', 'Right', 'Down']:
            base.key(key, .08, .2)
            moves.append({'key': key, 'head': [base.cpu._RAM[0xA2 - 0x30], base.cpu._RAM[0xA3 - 0x30]]})
        crossings = []
        for speed, initial_score in [(0,0),(9,0),(0,99),(0,999),(9,990)]:
            probe = copy.deepcopy(base)
            ram = probe.cpu._RAM
            ram[0x70 - 0x30], ram[0xA2 - 0x30], ram[0xA3 - 0x30] = speed, 5, 17
            for i in range(5):
                ram[0x82 + i - 0x30] = initial_score // 10**i % 10
            for y in [17, 18, 19]:
                for segment in maps['Apollo126in1B0202'][19 - y]:
                    address, bit = map(int, segment.split('_'))
                    probe.cpu._LCDRAM[address] &= ~(1 << bit)
            probe.key('Rotate', .08, 5)
            crossings.append({'speedDigit': speed, 'scoreBefore':initial_score, 'speedAfter':ram[0x70-0x30], 'score': sum(ram[0x82 + i - 0x30] * 10 ** i for i in range(5)), 'head': [ram[0xA2 - 0x30], ram[0xA3 - 0x30]]})
        rom = machine.cpu.get_ROM()
        result['frog'] = {'device': 'Apollo126in1B0202', 'mode': 'A01', 'method': 'Natural input/row-update traces. Crossing tests explicitly set head ($A2/$A3), decimal score and speed registers and clear the landing rows in LCD RAM; game code is unchanged.', 'roadGroups': groups, 'moves': moves, 'crossings': crossings,
                          'runLengths': [rom.get_byte(0x21F7 + i) for i in range(48)]}

    if args.section in ['all', 'beetle']:
        base = Machine('Apollo126in1B0202')
        base.run(3)
        for _ in range(3):
            base.set_key('Right', True)
            base.key('Down')
            base.set_key('Right', False)
            base.run(.1)
        for _ in range(7):
            base.key('Right')
        base.key('Mute')
        base.key('StartP', .2, .1)
        base.run(1)
        start, steps, pending = base.cycles, [], False
        while base.cycles < start + 2_100_000:
            pc = base.cpu._get_pc()
            if pc == 0x1DD5:
                pending, at = True, base.cycles
            if pending and pc == 0x14EB:
                steps.append({'cycle': at - start, 'enemies': base.cpu._RAM[0x72-0x30:0x7A-0x30].copy()})
                pending = False
            elapsed = base.cpu.clock()
            base.cycles += elapsed
            base.bus.emit_clock(elapsed)
        hits = []
        for y in [3, 4, 10, 15]:
            probe = copy.deepcopy(base)
            ram = probe.cpu._RAM
            ram[0x72-0x30:0x7A-0x30] = [4,y,255,255,255,255,255,255]
            for row in maps[probe.name]:
                for segment in row:
                    address, bit = map(int, segment.split('_'))
                    probe.cpu._LCDRAM[address] &= ~(1 << bit)
            for x, row in [(4,19),(3,19),(5,19),(4,18),(4,19-y)]:
                address, bit = map(int, maps[probe.name][row][x].split('_'))
                probe.cpu._LCDRAM[address] |= 1 << bit
            before = sum(ram[0x82+i-0x30]*10**i for i in range(5))
            probe.key('Rotate', .08, .15)
            after = sum(ram[0x82+i-0x30]*10**i for i in range(5))
            hits.append({'target': [4,y], 'points': after-before, 'replacement': ram[0x72-0x30:0x74-0x30].copy()})
        rom = base.cpu.get_ROM()
        result['beetle'] = {'device': base.name, 'mode': 'D01', 'method': 'Natural four-enemy updates. Hit probes explicitly construct one enemy, the gun and LCD target; original shooting code is unchanged.',
                            'steps': steps, 'hits': hits, 'formationMasks': [rom.get_byte(0x2197+i) for i in range(12)]}

    if args.section in ['all', 'dice']:
        import itertools
        machine = Machine('Apollo126in1B0202')
        machine.run(3)
        for _ in range(4):
            machine.set_key('Right', True)
            machine.key('Down')
            machine.set_key('Right', False)
            machine.run(.1)
        machine.key('Mute')
        machine.key('StartP')
        machine.run(4)
        values = []
        for dice in itertools.product(range(1, 7), repeat=4):
            probe = copy.deepcopy(machine)
            probe.cpu._PC, probe.cpu._ROM_BANK = 0x189B, 1
            for i, face in enumerate(dice):
                probe.cpu._RAM[0x96 + i - 0x30] = face - 1
            for _ in range(1000):
                if probe.cpu._get_pc() in [0x28C8, 0x28CB, 0x2903, 0x290A]:
                    break
                probe.cpu.clock()
            else:
                raise AssertionError(dice)
            values.append(probe.cpu._A)
        result['dice'] = {'device': 'Apollo126in1B0202', 'mode': 'E02', 'method':
                         'Execute unmodified pair-evaluation subroutine at $189B, bank 1, with all 1296 constructed $96..$99 four-die inputs. Zero-based face registers; return 0 = reroll, 255 = four equal, other returns add two. No whole-game timing claims.', 'rawValues': values}

    if args.section in ['all', 'audio']:
        class Sink:
            cycles = 0
            commands = None
            def audio_handler(self, channel, data):
                self.commands.append({'cycle': self.cycles, 'channel': channel, 'tone': data})
        sink = Sink()
        config = json.loads(Path('assets/E88_8in1.brick').read_text())
        channels = {}
        for index in [0, 5, 11, 12, 13, 14]:
            sink.cycles, sink.commands = 0, []
            sound = HT4BITsound(config['mask_options'], config['clock'], Interconnect(sink))
            sound.set_one_cycle()
            sound.set_sound_channel(index)
            while sound._sound_on and sink.cycles < 20_000_000:
                sink.cycles += 4
                sound.clock(4)
            assert not sound._sound_on
            channels[str(index)] = sink.commands
        result['audio'] = {'device': 'E88_8in1', 'method':
                           'Execute the original HT4BITsound decoder with its configured sound ROM, 1 MHz clock and four-cycle sampling; one cycle of each channel.', 'channels': channels}
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2) + '\n')
    print(f'Wrote {output}', file=sys.stderr)


if __name__ == '__main__':
    main()
