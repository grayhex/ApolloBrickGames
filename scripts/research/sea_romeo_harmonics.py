# Romeo revision: harmonic confirmation across aligned recording passes, no inverse microphone-gain weighting.
# 1327 Hz overlapping 664.8 Hz is treated as a harmonic, not an independent octave voice.
import sys,json
import sea_audio_tunes as old
import numpy as np
from scipy.ndimage import median_filter
SR=44100;WIN=4096;HOP=220;STEP=HOP/SR
scale=old.SCALE*.997

def extract(path,cfg):
 x=old.load(path); freq=np.fft.rfftfreq(32768,1/SR);hann=np.hanning(WIN)
 evidence=[]
 for i in range(0,len(x)-WIN,HOP):
  s=np.abs(np.fft.rfft(x[i:i+WIN]*hann,32768))/(WIN/2)
  row=[]
  for pitch in scale:
   scores=[]
   for k in [1,3,5,7]:
    f=pitch*k
    peak=s[abs(freq-f)<(7 if k==1 else 16)].max()
    bg=np.median(s[(abs(freq-f)>35)&(abs(freq-f)<80)])
    scores.append(peak/max(bg,1e-5) if peak>2e-5 else 0)
   row.append(max(scores) if scores[0]>20 or sum(v>4 for v in scores)>=2 else 0)
  evidence.append(row)
 evidence=np.array(evidence);n=int(cfg['end']/STEP)
 passes=[]
 for start in cfg['starts']:
  # Evidence is timestamped at the FFT centre, unlike the original NNLS code.
  at=int(round((start-WIN/(2*SR))/STEP));p=evidence[at:at+n];passes.append(np.pad(p,((0,n-len(p)),(0,0)),constant_values=np.nan))
 m=np.nanmedian(np.stack(passes),axis=0)
 active=m>10
 active=np.array([median_filter(active[:,k],size=9) for k in range(10)]).T
 # Keep only the two most convincing pitches; no microphone-level compensation.
 for i in range(len(m)):
  indices=np.where(active[i])[0]
  if len(indices)>2:
   active[i,sorted(indices,key=lambda k:-m[i,k])[2:]]=False
 seg=[];a=0
 keys=[tuple(np.where(row)[0]) for row in active]
 for b in range(1,len(keys)+1):
  if b==len(keys) or keys[b]!=keys[a]:
   seg.append([a*STEP,b*STEP,tuple(old.SCALE[k] for k in keys[a])]);a=b
 # Drop <65ms spectral flutter; don't turn isolated noise into a new melody note.
 seg=old.drop_flickers(seg,weak=tuple(old.SCALE),shorter=.065)
 return old.voices(seg,cfg['end']),seg
# Download the archived romeo.m4a into docs/research and decode it as mono 44.1 kHz WAV before running.
tracks,seg=extract(sys.argv[1],old.TUNES['romeo'])
for item in seg:
 if 664.8 in item[2] and 1327 in item[2]: item[2] = tuple(p for p in item[2] if p != 1327)
for i,(a,b,ps) in enumerate(seg):
 if not ps and .065 <= b-a <= .22 and 0<i<len(seg)-1:
  seg[i][2]=tuple(sorted(set(seg[i-1][2]) & set(seg[i+1][2])))
tracks=old.voices(seg,19.115)
print(json.dumps({'tracks':tracks,'states':seg}))
