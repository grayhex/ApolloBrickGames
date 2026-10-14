import numpy as np, cv2, json
from cells import ink_matrix
a = np.load('lcd_full.npy').astype(np.float32)
N = len(a)
M = np.stack([ink_matrix(a[i]) for i in range(N)])   # N x 6 x 13
np.save('ink.npy', M)
def cls(m):
    s = np.full(m.shape, '.', dtype='<U1')
    s[m >= 0.40] = '#'
    s[(m >= 0.06) & (m < 0.40)] = '+'
    return s
prev = None; last_t=-1
out=[]
for i in range(15, N):
    c = cls(M[i])
    key = '\n'.join(''.join(r) for r in c)
    if prev is None or (key != prev and i - last_t >= 3):
        out.append((i, key)); prev = key; last_t = i
print(len(out), 'changes')
for i, key in out[:60]:
    print(f'--- frame {i} t={i/30:.2f}s'); print(key)
