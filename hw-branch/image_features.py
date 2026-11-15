"""Pull selected canopy images straight out of the 31 GB 4TU zip and measure simple features.

Usage: python3 image_features.py OUT_DIR [HOUR]
Needs: pip install remotezip pillow numpy pandas
Writes OUT_DIR/image_features.csv (one row per camera x day) and small JPEG thumbnails in OUT_DIR/thumbs/.
Re-running skips images already measured.
"""
import io, os, re, sys, threading
from concurrent.futures import ThreadPoolExecutor, as_completed
import numpy as np
import pandas as pd
from PIL import Image
from remotezip import RemoteZip

URL = 'https://data.4tu.nl/file/fa102772-32db-4b30-bace-12f2016722ce/818e2966-7015-432d-aa7c-1b9158c011cf'
CAM_TEAM = {'cam_18': 'trigger', 'cam_19': 'ideas', 'cam_1': 'reference',
            'cam_20': 'agrifusion', 'cam_21': 'mugrow', 'camir_27': 'tomatonuts'}
PAT = re.compile(r'dataset4tu/(\w+)/\1_(\d{4})_(\d\d)_(\d\d)_(\d\d)_\d\d_\d\d_(\w+)\.png')
local = threading.local()


def zf():
    if not hasattr(local, 'z'):
        local.z = RemoteZip(URL)  # one HTTP connection per thread
    return local.z


def rgb_features(img):
    a = np.asarray(img.convert('RGB').resize((960, 540), Image.BILINEAR))
    h, s, v = np.moveaxis(np.asarray(Image.fromarray(a).convert('HSV')), -1, 0).astype(int)  # PIL HSV, 0-255 scale
    vivid = (s > 90) & (v > 80)
    r, g, b = [a[..., i].astype(float) for i in range(3)]
    return {
        'red_pct': 100 * (vivid & ((h < 17) | (h > 234))).mean(),     # red fruit
        'orange_pct': 100 * (vivid & (h >= 17) & (h < 30)).mean(),    # turning fruit
        'yellow_pct': 100 * (vivid & (h >= 30) & (h < 45)).mean(),    # turning fruit or yellowing leaves
        'green_pct': 100 * ((2 * g - r - b) > 20).mean(),             # leaves + green fruit (excess green)
        'mean_r': r.mean(), 'mean_g': g.mean(), 'mean_b': b.mean(),   # colour cast check (grow lamps)
    }, a


def depth_features(img):
    d = np.asarray(img).astype(float)
    ok = d > 0
    q = np.percentile(d[ok], [10, 50, 90]) if ok.any() else [np.nan] * 3
    return {'depth_valid_pct': 100 * ok.mean(), 'depth_p10_mm': q[0], 'depth_p50_mm': q[1], 'depth_p90_mm': q[2]}


def work(key, files, thumbs):
    row = dict(zip(['cam', 'team', 'date', 'hour'], key))
    z = zf()
    if 'rgb' in files:
        feats, small = rgb_features(Image.open(io.BytesIO(z.read(files['rgb']))))
        row.update(feats)
        Image.fromarray(small).resize((480, 270)).save(f"{thumbs}/{row['team']}_{row['date']}_{row['hour']:02d}.jpg", quality=80)
    if 'depth' in files:
        row.update(depth_features(Image.open(io.BytesIO(z.read(files['depth'])))))
    return row


def main(out, hour=12):
    thumbs = f'{out}/thumbs'; os.makedirs(thumbs, exist_ok=True)
    csv = f'{out}/image_features.csv'
    with RemoteZip(URL) as z:
        names = z.namelist()
    groups = {}
    for n in names:
        m = PAT.match(n)
        if m and int(m[5]) == hour and m[6] in ('rgb', 'depth'):
            groups.setdefault((m[1], CAM_TEAM[m[1]], f'{m[2]}-{m[3]}-{m[4]}', int(m[5])), {})[m[6]] = n
    done = set()
    if os.path.exists(csv):
        old = pd.read_csv(csv); done = set(zip(old.cam, old.date))
    todo = {k: v for k, v in groups.items() if (k[0], k[2]) not in done}
    print(f'{len(groups)} camera-days at {hour}:00, {len(todo)} to fetch', flush=True)
    with ThreadPoolExecutor(8) as ex:
        futs = [ex.submit(work, k, v, thumbs) for k, v in todo.items()]
        for i, f in enumerate(as_completed(futs), 1):
            try:
                pd.DataFrame([f.result()]).to_csv(csv, mode='a', header=not os.path.exists(csv), index=False)
            except Exception as e:  # keep going; failed images are retried on the next run
                print('failed:', e, flush=True)
            if i % 25 == 0:
                print(f'{i}/{len(todo)}', flush=True)
    df = pd.read_csv(csv).drop_duplicates(['cam', 'date']).sort_values(['team', 'date'])
    df.to_csv(csv, index=False)
    print('done', len(df), 'rows')


if __name__ == '__main__':
    main(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 12)
