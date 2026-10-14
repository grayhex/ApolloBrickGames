import numpy as np, cv2
a = np.load('lcd_full.npy').astype(np.float32)
M = np.load('ink.npy')
X0, PX, Y0, PY = 15.0, 37.9, 58.0, 37.0
def box(r, c, pad=0):
    x0=int(round(X0+c*PX))+pad; x1=int(round(X0+(c+1)*PX))-pad; y0=int(round(Y0+r*PY))+pad; y1=int(round(Y0+(r+1)*PY))-pad
    return x0,x1,y0,y1
def hp(img):
    return img - cv2.GaussianBlur(img, (0,0), 10)
# template: hero at (5,1) frame 136..139 averaged
tpl = np.mean([hp(a[i])[box(5,1,3)[2]:box(5,1,3)[3], box(5,1,3)[0]:box(5,1,3)[1]] for i in (136,137,138,139)], axis=0)
tpl = tpl - tpl.mean()
print('template', tpl.shape, 'std', tpl.std())
cv2.imwrite('hero_tpl.png', cv2.resize(cv2.normalize(tpl,None,0,255,cv2.NORM_MINMAX).astype(np.uint8), None, fx=5, fy=5, interpolation=cv2.INTER_CUBIC))
H, W = tpl.shape
resp = np.zeros((len(a), 6, 13), np.float32)
for i in range(len(a)):
    h = hp(a[i])
    for r in range(6):
        for c in range(13):
            x0,x1,y0,y1 = box(r,c,3)
            # search window with +-3 px shift
            wx0=max(0,x0-3); wy0=max(0,y0-3); wx1=min(h.shape[1],x1+3); wy1=min(h.shape[0],y1+3)
            win = h[wy0:wy1, wx0:wx1]
            if win.shape[0] < H or win.shape[1] < W: continue
            res = cv2.matchTemplate(win, tpl, cv2.TM_CCOEFF_NORMED)
            resp[i,r,c] = res.max()
np.save('hero_resp.npy', resp)
