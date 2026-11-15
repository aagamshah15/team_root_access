"""Pull the 12:00 RGB + depth frames for all six cameras out of the 31 GB canopy-camera zip
using HTTP range requests (only the needed bytes are downloaded, ~8 GB).

RGB is saved downscaled to 1920x1080 JPEG (q95); depth is saved as the original 16-bit PNG.
Safe to re-run: files already on disk are skipped.

Run: python3 fetch_noon_images.py [HOUR]   (default 12)
"""
import io
import re
import sys
import zipfile
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from PIL import Image

URL = "https://data.4tu.nl/file/fa102772-32db-4b30-bace-12f2016722ce/818e2966-7015-432d-aa7c-1b9158c011cf"
OUT = Path(__file__).resolve().parent / "data" / "agc4" / "images_noon"
HOUR = sys.argv[1] if len(sys.argv) > 1 else "12"
PAT = re.compile(rf"/(cam\w*?_\d+)_\d{{4}}_\d\d_\d\d_{HOUR}_\d\d_\d\d_(rgb|depth)\.png$")
WORKERS = 10


class HTTPFile(io.RawIOBase):
    def __init__(self, url, size=None):
        self.url, self.pos = url, 0
        if size is None:
            r = urllib.request.urlopen(urllib.request.Request(url, headers={"Range": "bytes=0-0"}))
            size = int(r.headers["Content-Range"].split("/")[1])
        self.size = size

    def seekable(self): return True
    def readable(self): return True
    def tell(self): return self.pos

    def seek(self, o, w=0):
        self.pos = o if w == 0 else self.pos + o if w == 1 else self.size + o
        return self.pos

    def readinto(self, b):
        if not len(b) or self.pos >= self.size:
            return 0
        end = min(self.pos + len(b), self.size) - 1
        for attempt in range(5):
            try:
                req = urllib.request.Request(self.url, headers={"Range": f"bytes={self.pos}-{end}"})
                d = urllib.request.urlopen(req, timeout=120).read()
                break
            except Exception:
                if attempt == 4:
                    raise
        b[: len(d)] = d
        self.pos += len(d)
        return len(d)


def open_zip(size=None):
    import time
    for attempt in range(6):  # the server sometimes answers with an error page; back off and retry
        try:
            f = HTTPFile(URL, size)
            return zipfile.ZipFile(io.BufferedReader(f, buffer_size=16 << 20)), f.size
        except Exception:
            if attempt == 5:
                raise
            time.sleep(10 * (attempt + 1))


def target(name):
    cam, kind = PAT.search(name).groups()
    stem = Path(name).stem
    return OUT / kind / cam / (stem + (".jpg" if kind == "rgb" else ".png"))


def work(names, size):
    z, _ = open_zip(size)
    done = []
    for n in names:
        dst = target(n)
        if dst.exists():
            continue
        dst.parent.mkdir(parents=True, exist_ok=True)
        try:
            data = z.read(n)
        except Exception as e:  # skip this file; a re-run picks it up
            print(f"failed {Path(n).name}: {e}", flush=True)
            continue
        tmp = dst.with_suffix(dst.suffix + ".part")
        if dst.parent.parent.name == "rgb":
            Image.open(io.BytesIO(data)).convert("RGB").resize((1920, 1080), Image.LANCZOS).save(tmp, "JPEG", quality=95)
        else:
            tmp.write_bytes(data)
        tmp.rename(dst)
        done.append(dst.name)
    return done


def main():
    z, size = open_zip()
    names = sorted(i.filename for i in z.infolist() if PAT.search(i.filename))
    todo = [n for n in names if not target(n).exists()]
    # ripening happens from mid-October: fetch those frames first, then the earlier season
    late = lambda n: re.search(r"_2024_(\d\d)_(\d\d)_", n).groups() >= ("10", "15")
    todo = [n for n in todo if late(n)] + [n for n in todo if not late(n)]
    print(f"{len(names)} noon frames, {len(todo)} to fetch", flush=True)
    chunks = [todo[i::WORKERS] for i in range(WORKERS)]  # interleaved, so each worker keeps the late-first order
    n = 0
    with ThreadPoolExecutor(WORKERS) as ex:
        futs = [ex.submit(work, c, size) for c in chunks if c]
        for f in as_completed(futs):
            try:
                n += len(f.result())
            except Exception as e:
                print(f"worker gave up: {e}", flush=True)
            print(f"worker finished, total fetched {n}", flush=True)
    print("done", flush=True)


if __name__ == "__main__":
    main()
