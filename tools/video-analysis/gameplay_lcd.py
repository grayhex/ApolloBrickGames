"""Стабилизация LCD в видео геймплея (ручная съёмка, 640 × 360): каждый N-й кадр выпрямляется в холст 432 × 216 (1/4 логического 1728 × 864).

Запуск: python3 gameplay_lcd.py in.mp4 out_dir [шаг_кадров=3]
Опорный кадр — t = 60 с (устройство почти анфас), углы стекла LCD в нём заданы вручную (QUAD, TL, TR, BR, BL). Для каждого кадра ORB + RANSAC
находят гомографию к опорному, затем стекло выпрямляется. Результат:
  out_dir/lcd.npy   — uint8 [N, 216, 432], выпрямленный LCD (чёрный кадр, если совместить не удалось);
  out_dir/meta.json — номера кадров, время, число инлайеров (0 — не удалось).
Нужны opencv-python и numpy. Кадры не копятся в памяти: видео читается потоком.
"""
import json
import sys
from pathlib import Path

import cv2
import numpy as np

video, out = sys.argv[1], Path(sys.argv[2])
step = int(sys.argv[3]) if len(sys.argv) > 3 else 3
out.mkdir(parents=True, exist_ok=True)

REF_T = 60.0
QUAD = np.float32([[206.0, 74.5], [354.0, 72.5], [354.0, 146.3], [206.0, 148.0]])  # стекло LCD в опорном кадре (кадр 640 × 360)
LID = (175, 5, 385, 205)  # x0, y0, x1, y1: крышка в опорном кадре — искать признаки только на ней
CW, CH = 432, 216
H_ref2canon = cv2.getPerspectiveTransform(QUAD, np.float32([[0, 0], [CW, 0], [CW, CH], [0, CH]]))

cap = cv2.VideoCapture(video)
fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
orb = cv2.ORB_create(2500)
bf = cv2.BFMatcher(cv2.NORM_HAMMING)
clahe = cv2.createCLAHE(2.0, (8, 8))

cap.set(cv2.CAP_PROP_POS_FRAMES, int(REF_T * fps))
ok, ref = cap.read()
ref_gray = clahe.apply(cv2.cvtColor(ref, cv2.COLOR_BGR2GRAY))
mask = np.zeros(ref_gray.shape, np.uint8)
mask[LID[1]:LID[3], LID[0]:LID[2]] = 255
kp_ref, des_ref = orb.detectAndCompute(ref_gray, mask)
print('признаков в опорном кадре:', len(kp_ref))

cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
count = (total + step - 1) // step
lcd = np.zeros((count, CH, CW), np.uint8)
meta = []
index = 0
frame_no = 0
while True:
    ok, frame = cap.read()
    if not ok:
        break
    if frame_no % step == 0:
        gray = clahe.apply(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY))
        kp, des = orb.detectAndCompute(gray, None)
        inliers = 0
        if des is not None and len(kp) > 20:
            pairs = bf.knnMatch(des, des_ref, k=2)
            good = [a for a, b in (p for p in pairs if len(p) == 2) if a.distance < 0.75 * b.distance]
            if len(good) >= 14:
                src = np.float32([kp[g.queryIdx].pt for g in good])
                dst = np.float32([kp_ref[g.trainIdx].pt for g in good])
                H, inl = cv2.findHomography(src, dst, cv2.RANSAC, 3.0)
                if H is not None and int(inl.sum()) >= 12:
                    scale = np.sqrt(abs(np.linalg.det(H[:2, :2])))
                    if 0.5 < scale < 2.0:
                        inliers = int(inl.sum())
                        lcd[index] = cv2.warpPerspective(gray, H_ref2canon @ H, (CW, CH), flags=cv2.INTER_AREA)
        meta.append({'frame': frame_no, 't': round(frame_no / fps, 3), 'inliers': inliers})
        index += 1
    frame_no += 1
lcd = lcd[:index]
np.save(out / 'lcd.npy', lcd)
json.dump(meta, open(out / 'meta.json', 'w'))
print('кадров:', index, 'совмещено:', sum(m['inliers'] > 0 for m in meta))
