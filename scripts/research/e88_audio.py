#!/usr/bin/env python3
"""Trace E88 SROM channels and original Tetris sound commands. No ROM bytes are copied.
Run with --upstream /path/to/clean/BrickEmuPy --output /tmp/e88-audio.json.
"""
import argparse,json,os,subprocess,sys
from pathlib import Path
REV='376cca92c6d000ffd6046e5491f2a1c3d1a5eab0'
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--upstream',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
 root=a.upstream.resolve();out=a.output.resolve();maps=json.loads((Path(__file__).parent/'e23-lcd.json').read_text())
 assert subprocess.check_output(['git','-C',str(root),'rev-parse','HEAD'],text=True).strip()==REV
 assert not subprocess.check_output(['git','-C',str(root),'status','--porcelain'],text=True).strip()
 os.chdir(root);sys.path.insert(0,str(root))
 from cores.HT943 import HT943
 from cores.HT4BITsound import HT4BITsound
 from interconnect import Interconnect
 from peripherals.direct_input import DirectInput
 config=json.loads(Path('assets/E88_8in1.brick').read_text())
 class Machine:
  def __init__(self):
   self.cycles=0;self.audio=[];self.commands=[];self.bus=Interconnect(self);self.cpu=HT943(config['mask_options'],config['clock'],self.bus);self.keys=DirectInput(config['peripherals']['direct_input'],self.bus)
   original=self.cpu._sound.set_sound_channel
   def channel(n):self.commands.append({'cycle':self.cycles,'pc':self.cpu._PC,'channel':n});original(n)
   self.cpu._sound.set_sound_channel=channel
  def audio_handler(self,channel,data):self.audio.append({'cycle':self.cycles,'tone':data})
  def run(self,seconds):
   end=self.cycles+round(seconds*1e6)
   while self.cycles<end:
    cycles=self.cpu.clock();self.cycles+=cycles;self.bus.emit_clock(cycles)
  def key(self,name,hold=.08,after=.12):
   self.bus.emit_input('btn'+name,True);self.run(hold);self.bus.emit_input('btn'+name,False);self.run(after)
 result={'revision':REV,'clock':config['clock'],'channels':{},'actions':{},'clears':[]}
 for channel in [0,3,4,10,11,13,14,15]:
  m=Machine();m.audio=[];sound=HT4BITsound(config['mask_options'],config['clock'],Interconnect(m));sound.set_one_cycle();sound.set_sound_channel(channel)
  while sound._sound_on and m.cycles<20_000_000:m.cycles+=4;sound.clock(4)
  assert not sound._sound_on;result['channels'][str(channel)]=m.audio
 m=Machine();m.run(3);m.key('Start',.08,11);result['startup']=m.commands.copy()
 for key in ['Left','Right','Rotate','Down']:
  m.commands=[];m.key(key,.05,.12);result['actions'][key]=m.commands.copy()
 for rows in range(5):
  m=Machine();m.run(3);m.key('Mute');m.run(.27);m.key('Start',.08,1)
  def cells():return [(x,y) for y,row in enumerate(maps) for x,s in enumerate(row) if m.cpu._RAM[int(s.split('_')[0])] & (1<<int(s.split('_')[1]))]
  if len({x for x,y in cells()})>1:m.key('Rotate')
  gap=cells()[0][0]
  for row in maps[20-rows:] if rows else []:
   for x,segment in enumerate(row):
    address,bit=map(int,segment.split('_'));m.cpu._RAM[address]=(m.cpu._RAM[address]&~(1<<bit))|((x!=gap)<<bit)
  # Restore sound after deterministic muted preparation. No ROM/code patching.
  m.cpu._RAM[0xC3]|=1;m.commands=[];m.key('Down',.6,2)
  result['clears'].append({'rows':rows,'commands':m.commands})
 out.write_text(json.dumps(result,indent=2)+'\n');print(out)
if __name__=='__main__':main()
