import numpy as np, cv2
a = np.load('lcd_full.npy').astype(np.float32)
X0, PX, Y0, PY = 15.0, 37.9, 58.0, 37.0
def ink_matrix(img):
    bg = cv2.GaussianBlur(img, (0,0), 25)
    d = bg - img            # dark = positive
    M = np.zeros((6,13), np.float32)
    for r in range(6):
        for c in range(13):
            x0=int(X0+c*PX+4); x1=int(X0+(c+1)*PX-4); y0=int(Y0+r*PY+4); y1=int(Y0+(r+1)*PY-4)
            cell = d[y0:y1, x0:x1]
            M[r,c] = (cell > 14).mean()
    return M
if __name__ == '__main__':
    for i in (15, 150, 210, 270, 420, 500, 560):
        M = ink_matrix(a[i])
        print(i, 't=%.2f'%(i/30))
        for r in range(6):
            print(' '.join(f'{v:4.2f}' for v in M[r]))
