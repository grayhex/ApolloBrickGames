# Research script for the Sea Battle originals (see docs/brick/sea-battle-originals.md): Builds the [Hz, ms] step arrays in src/audio/seaTunes.ts from the transcribed notes (loop lengths closed to the recording).
# Inputs (the owner's videos, frames, intermediate JSON) are not stored in the repository.
import json, math
S='notes_start.json'; R='notes_romeo.json'
st=json.load(open(S)); ro=json.load(open(R))

def seq_from(notes, t0, t1, merge_gap=0.0):
    """notes in [t0,t1) -> list of (hz, ms) with rests for gaps; times relative to t0"""
    out=[]; cur=t0
    for n in notes:
        if n['start']<t0-1e-6 or n['end']>t1+1e-6: continue
        gap=n['start']-cur
        if gap>0.0075: out.append((0, round(gap*1000)))
        elif out and gap>0 : # absorb tiny gap into previous note
            h,m=out[-1]; out[-1]=(h,m+round(gap*1000))
        out.append((round(n['hz']), round((n['end']-n['start'])*1000)))
        cur=n['end']
    return out, cur

def fix_total(seq, total):
    s=sum(m for _,m in seq)
    h,m=seq[-1]; seq[-1]=(h,m+(total-s)); return seq

# ---- start tune: loop period 11299 ms from the 1116 onset (0.347 s)
body, endt = seq_from(st, 0.347, 10.783+0.002)
# noise + burble: 10.783..11.332 (549 ms) noise around 880, 11.332..11.646 (314) burble ~330
period=11299
body_ms=sum(m for _,m in body)
noise_ms=549; burble_ms=period-body_ms-noise_ms
print('start body ms',body_ms,'burble',burble_ms)
intro_loop = body+[(-880,noise_ms),(-330,burble_ms)]
intro_head = [(-330,305)]   # first burble before the first pass
assert sum(m for _,m in intro_loop)==period

# ---- romeo tune: loop period 19775 ms from 1116 onset at 1.100 s
rbody, endr = seq_from(ro, 1.100, 17.727+0.002)
rest=[(-330,339),(1116,320)]
r_ms=sum(m for _,m in rbody)+sum(m for _,m in rest)
last=19775-r_ms
print('romeo body ms',r_ms,'last 837 ms',last)
romeo_loop = rbody+rest+[(837,last)]
assert sum(m for _,m in romeo_loop)==19775

# ---- game A attract: 23567 ms synchronous with the animation loop
events=[(0.418,'n',510),(2.043,'b',0),(4.778,'n',517),(6.484,'n',540),(9.207,'n',517),(10.170,'b',0),(14.454,'n',575),(16.132,'b',0),(18.866,'n',511),(19.830,'b',0)]
BLIP=[(770,50),(1257,47),(1542,42),(1908,50),(2191,43),(2557,47)]
att=[]; cur=0
for t,k,d in events:
    ms=round(t*1000)
    if ms>cur: att.append((0,ms-cur)); cur=ms
    if k=='n': att.append((-904,d)); cur+=d
    else:
        for hz,m in BLIP: att.append((hz,m)); cur+=m
total=23567
att.append((0,total-cur))
assert sum(m for _,m in att)==total, sum(m for _,m in att)

def fmt(name, doc, seq, per=6):
    rows=[]
    for i in range(0,len(seq),per):
        rows.append('  '+' '.join(f'[{h},{m}],' for h,m in seq[i:i+per]))
    return f"/** {doc} */\nconst {name}: readonly Step[] = [\n"+'\n'.join(rows)+"\n];\n"
out = fmt('INTRO_HEAD','Первая «рябь» перед первым проходом мелодии заставки.',intro_head)
out+= fmt('INTRO_LOOP','Петля мелодии заставки (11,299 с): от «до#» второй октавы до шумового всплеска и «ряби» перед повтором.',intro_loop)
out+= fmt('ROMEO_LOOP','Петля музыки «Ромео и Джульетты» (19,775 с).',romeo_loop)
out+= fmt('ATTRACT_LOOP','Звук анимации игры A (23,567 с): шумовые вспышки и восходящие «капли» — совпадает с петлёй анимации.',att)
open('tunes_body.ts','w').write(out)
print(len(intro_loop),len(romeo_loop),len(att))
