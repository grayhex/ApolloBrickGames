# Research script for the Sea Battle originals (see docs/brick/sea-battle-originals.md): traces the cup icon of the LCD photo into polygons for src/render/seaCup.ts.
# usage: sea_cup_trace.py threshold blur epsilon tag (the photo itself is not stored in the repository).
import cv2, numpy as np, json, sys
thr=float(sys.argv[1]); blur=float(sys.argv[2]); eps=float(sys.argv[3]); tag=sys.argv[4]
im=cv2.imread('img_17398_329.webp'); g=cv2.cvtColor(im,cv2.COLOR_BGR2GRAY)
x0,y0,x1,y1=540,1390,940,1640; S=4
crop=g[y0:y1,x0:x1]
big=cv2.resize(crop,None,fx=S,fy=S,interpolation=cv2.INTER_CUBIC)
bl=cv2.GaussianBlur(big,(0,0),S*blur)
bg=cv2.GaussianBlur(big,(0,0),S*18)
diff=bg.astype(np.float32)-bl.astype(np.float32)
m=(diff>thr).astype(np.uint8)*255
m[840:,:]=0; m[:, :60]=0; m[:, -30:]=0; m[:60,:]=0
n,lab,stats,_=cv2.connectedComponentsWithStats(m)
keep=np.zeros_like(m)
for i in range(1,n):
    if stats[i,cv2.CC_STAT_AREA]>=350: keep[lab==i]=255
cnts,hier=cv2.findContours(keep,cv2.RETR_CCOMP,cv2.CHAIN_APPROX_NONE)
def chaikin(p,it=2):
    for _ in range(it):
        q=[]
        for i in range(len(p)):
            a=p[i]; b=p[(i+1)%len(p)]
            q.append(0.75*a+0.25*b); q.append(0.25*a+0.75*b)
        p=np.array(q)
    return p
polys=[]
for c in cnts:
    if cv2.contourArea(c)<320: continue
    a=cv2.approxPolyDP(c,eps,True).reshape(-1,2).astype(float)
    if len(a)>=3: polys.append(chaikin(a,1))
def conv(P):
    px=x0+P[:,0]/S; py=y0+P[:,1]/S
    return np.stack([162.7+(px-442)/6.4, 320-(1608-py)/6.4],1)
cen=np.array([conv(p).mean(0) for p in polys]); med=np.median(cen,0)
polys=[p for p,c in zip(polys,cen) if np.hypot(*(c-med))<24]
allc=np.concatenate([conv(p) for p in polys]); lo,hi=allc.min(0),allc.max(0); ctr=(lo+hi)/2
out=[[int(round(v*10)) for v in (conv(p)-ctr).reshape(-1)] for p in polys]
json.dump({'center':[round(float(ctr[0]),1),round(float(ctr[1]),1)],'size':[round(float(v),1) for v in hi-lo],'polys':out},open(f'cup_{tag}.json','w'))
W,H=900,500; sc=14; acc=np.zeros((H,W),np.uint8)
for o in out:
    t=np.zeros((H,W),np.uint8)
    pts=(np.array(o).reshape(-1,2)/10*sc+np.array([W/2,H/2])).astype(np.int32)
    cv2.fillPoly(t,[pts],1); acc^=t
img=np.full((H,W),255,np.uint8); img[acc>0]=20
cv2.imwrite(f'cup_{tag}.png',img)
print(tag,sum(len(o) for o in out)//2,'vertices',len(out),'contours',json.load(open(f'cup_{tag}.json'))['size'])
