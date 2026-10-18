#!/usr/bin/env python3
"""E88/B0202 native menu and shape observations. Never copies ROMs into the application.
Requires a clean pinned upstream checkout; see docs/devices/e88-b0202.md.
"""
import argparse, copy, hashlib, json, os, statistics, subprocess, sys
from pathlib import Path
REVISION='376cca92c6d000ffd6046e5491f2a1c3d1a5eab0'
HERE=Path(__file__).resolve().parent

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--upstream',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args();root=args.upstream.resolve();output=args.output.resolve()
    assert subprocess.check_output(['git','-C',str(root),'rev-parse','HEAD'],text=True).strip()==REVISION
    assert not subprocess.check_output(['git','-C',str(root),'status','--porcelain'],text=True).strip()
    maps = json.loads((HERE / 'device-lcd.json').read_text())
    maps['Apollo126in1B0202'] = json.loads((HERE / 'b0202-lcd.json').read_text())
    maps['E23PlusMarkII96in1'] = maps['E88_8in1'] = json.loads((HERE / 'e23-lcd.json').read_text())
    os.chdir(root)
    sys.path.insert(0, str(root))
    from cores import cores_map
    from interconnect import Interconnect
    from peripherals.direct_input import DirectInput

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

    result={'revision':REVISION,'menus':{},'e88':{}}
    names={'e88':'E88_8in1','apollo-b0202':'Apollo126in1B0202'}
    result['romSha256']={id:hashlib.sha256((root/f'assets/{name}.bin').read_bytes()).hexdigest() for id,name in names.items()}
    def field(machine):
        cells=machine.cells()
        return [''.join('1' if [x,y] in cells else '0' for x in range(10)) for y in range(20)]
    for id,name in names.items():
        m=Machine(name);m.run(3);m.key('Mute');frames={}
        if id=='e88':
            for n in range(1,9):frames[str(n)]=field(m);m.key('Down')
            assert field(m)==frames['1']
        else:
            for group in 'ABCDEFGHI':
                count=0
                while not count or m.cpu._RAM[5]!=1:
                    code=group+str(m.cpu._RAM[5]).zfill(2)
                    assert code not in frames and count<55
                    frames[code]=field(m);count+=1;m.key('Down')
                m.set_key('Right',True);m.key('Down');m.set_key('Right',False);m.run(.1)
                for _ in range(9):m.key('Right')
            assert len(frames)==126
        result['menus'][id]=frames
    # Preserve evidence for the unresolved families as well; an initial frame is not
    # sufficient to enable a profile. Inputs are kept for later timing/score research.
    bstarts=[]
    m=Machine(names['apollo-b0202']);m.run(3);m.key('Mute')
    variants={'A':[1,2,10],'B':[1],'C':[1],'D':[1],'E':[1,2,3],
              'F':[1],'G':[1],'H':[1,2,3,4,5,6,7],'I':[1,2,3,4,5,6,7]}
    for group,numbers in variants.items():
        for number in numbers:
            p=copy.deepcopy(m)
            for _ in range(number-1):p.key('Down')
            p.key('StartP',.08,1.5)
            observation={'code':group+str(number).zfill(2),'inputs':p.inputs,'field':field(p),'actions':{}}
            for key in ['Left','Right','Down','Rotate']:
                q=copy.deepcopy(p);q.key(key,.08,.2);observation['actions'][key]=field(q)
            bstarts.append(observation)
        m.set_key('Right',True);m.key('Down');m.set_key('Right',False);m.run(.1)
        for _ in range(9):m.key('Right')
    result['b0202']={'starts':bstarts}
    m=Machine(names['e88']);m.run(3);m.key('Mute');levels=[]
    for _ in range(14):levels.append(m.cpu._RAM[0x81]);m.key('Left')
    assert levels==list(range(13))+[0]
    result['e88']['menuLevels']=levels
    periods=[]
    for speed in range(10):
        m=Machine(names['e88']);m.run(3);m.key('Mute')
        for _ in range(speed):m.key('Right')
        m.key('Start',.08,.01);last=None;times=[]
        for _ in range(3000):
            m.run(.002);cells=m.cells()
            if not cells:continue
            y=max(c[1] for c in cells)
            if y!=last:
                if last is not None and y==last+1:times.append(m.cycles/m.config['clock'])
                last=y
            if len(times)>=7:break
        assert len(times)==7
        ms=[round((b-a)*1000,3) for a,b in zip(times,times[1:])]
        periods.append({'displaySpeed':speed,'sampleMs':2,'periodsMs':ms,'medianMs':round(statistics.median(ms),3)})
    result['e88']['fall']=periods
    # Constructed subroutine inputs: execute original $E1C, stop before RET at $E79.
    # No claims of bit-identical whole-game RNG; record resulting geometry only.
    shapes=[]
    for shape in range(14):
        rotations=[]
        for angle in range(4):
            p=copy.deepcopy(m);p.cpu._PC=0xE1C;p.cpu._RAM[0x39]=shape;p.cpu._RAM[0x3A]=angle
            for _ in range(2000):
                p.cpu.clock()
                if p.cpu._PC==0xE79:break
            else:raise AssertionError('shape routine did not return')
            rows=p.cpu._RAM[0x2C:0x30]
            rotations.append([[x-1,2-y] for y,row in enumerate(rows) for x in range(4) if row&(8>>x)])
        shapes.append(rotations)
    result['e88']['poses']=shapes
    # Observation of all eight starts and the four physical game keys, not guessed aliases.
    starts=[]
    for mode in range(8):
        m=Machine(names['e88']);m.run(3);m.key('Mute')
        for _ in range(mode):m.key('Down')
        m.key('Start',.08,1.5)
        observation={'mode':mode+1,'field':field(m),'actions':{}}
        for key in ['Left','Right','Down','Rotate']:
            p=copy.deepcopy(m);p.key(key,.08,.2);observation['actions'][key]=field(p)
        starts.append(observation)
    result['e88']['starts']=starts
    # Constructed wells, natural vertical-I start at a fixed boot delay. Only occupied cells,
    # decimal score and speed are injected; ROM and game code remain unchanged.
    m=Machine(names['e88']);m.run(3);m.key('Mute');m.run(.27);m.key('Start',.08,1)
    if len({x for x,y in m.cells()})>1:m.key('Rotate')
    assert len(m.cells())==4 and len({x for x,y in m.cells()})==1
    clears=[]
    for rows,score,speed in [(1,0,0),(2,0,0),(3,0,0),(4,0,0),(1,990,0),(1,9990,0),(1,990,9)]:
        p=copy.deepcopy(m);gap=p.cells()[0][0]
        for i in range(4):p.cpu._RAM[0x4C+i]=score//10**i%10
        p.cpu._RAM[0x80]=speed
        for row in maps[names['e88']][20-rows:]:
            for x,segment in enumerate(row):
                address,bit=map(int,segment.split('_'))
                p.cpu._RAM[address]=(p.cpu._RAM[address]&~(1<<bit))|((x!=gap)<<bit)
        p.key('Down',.6,.8)
        clears.append({'rows':rows,'beforeScore':score,'score':sum(p.cpu._RAM[0x4C+i]*10**i for i in range(4)),
                       'speedBefore':speed,'speedAfter':p.cpu._RAM[0x80],'lines':p.cpu._RAM[0x48:0x4C]})
    result['e88']['scoring']={'delay':.27,'inputs':m.inputs,'clears':clears}
    from cores.HT4BITsound import HT4BITsound
    m=Machine(names['e88']);m.audio.clear();m.cycles=0
    sound=HT4BITsound(m.config['mask_options'],m.config['clock'],Interconnect(m))
    sound.set_one_cycle();sound.set_sound_channel(7)
    while sound._sound_on and m.cycles<20_000_000:
        m.cycles+=4;sound.clock(4)
    assert not sound._sound_on
    result['e88']['menuAudio']=m.audio
    output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(result,indent=2)+'\n')
    print(output)

if __name__=='__main__':main()
