"""Fetch a bounded set of 4TU RGB frames using ZIP range reads and compare lamp conditions."""
import argparse
from collections import Counter
import io
from datetime import date
import json
from pathlib import Path
import re
from urllib.request import Request, urlopen
from zipfile import ZipFile

import numpy as np
from PIL import Image


URL = "https://data.4tu.nl/file/fa102772-32db-4b30-bace-12f2016722ce/818e2966-7015-432d-aa7c-1b9158c011cf"
PATTERN = re.compile(r"dataset4tu/(\w+)/\1_(\d{4})_(\d\d)_(\d\d)_(\d\d)_\d\d_\d\d_rgb\.png")


class RangeFile(io.RawIOBase):
    """Seekable view of a server that enforces HTTP partial-content responses."""

    def __init__(self, url):
        self.url = url
        self.position = 0
        self.name = url
        with self.request("bytes=0-0") as response:
            self.length = int(response.headers["Content-Range"].split("/")[-1])

    def request(self, byte_range):
        response = urlopen(Request(self.url, headers={"Range": byte_range}), timeout=30)
        if response.status != 206:
            response.close()
            raise OSError("Archive server did not honor the byte range")
        return response

    def seekable(self):
        return True

    def readable(self):
        return True

    def tell(self):
        return self.position

    def seek(self, offset, whence=io.SEEK_SET):
        base = {io.SEEK_SET: 0, io.SEEK_CUR: self.position, io.SEEK_END: self.length}[whence]
        if base + offset < 0:
            raise OSError("Negative archive offset")
        self.position = base + offset
        return self.position

    def read(self, size=-1):
        remaining = max(0, self.length - self.position)
        count = remaining if size < 0 else min(size, remaining)
        if not count:
            return b""
        if count > 32 * 1024 * 1024:
            raise OSError("A single archive read exceeded the 32 MiB budget")
        with self.request(f"bytes={self.position}-{self.position + count - 1}") as response:
            data = response.read(count + 1)
        if len(data) != count:
            raise OSError("Incomplete archive range")
        self.position += count
        return data


def measure(image):
    """Return the red index after per-image white balancing."""
    array = np.asarray(image, dtype=float)
    reference = np.percentile(array.reshape(-1, 3), 99, axis=0)
    balanced = np.clip(array * 255 / np.maximum(reference, 1), 0, 255).astype("uint8")
    h, s, v = np.moveaxis(np.asarray(Image.fromarray(balanced).convert("HSV")), -1, 0)
    mask = (s > 140) & (v > 80) & ((h < 17) | (h > 234))
    return round(100 * float(mask.mean()), 4)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--camera", default="cam_21")
    parser.add_argument("--start", type=date.fromisoformat, default=date(2024, 11, 5))
    parser.add_argument("--end", type=date.fromisoformat, default=date(2024, 11, 5))
    parser.add_argument("--output", type=Path, default=Path("dashboard/camera"))
    parser.add_argument("--archive", type=Path, help="Use an existing local archive")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    records = []
    with ZipFile(args.archive or RangeFile(URL)) as archive:
        matches = []
        for name in archive.namelist():
            match = PATTERN.fullmatch(name)
            if not match or match[1] != args.camera:
                continue
            day = date(*map(int, match.groups()[1:4]))
            if args.start <= day <= args.end:
                matches.append((day, match[5], name))
        if not matches or len(matches) > 40:
            parser.error(f"Select a date range with 1–40 frames. Found {len(matches)}.")
        for day, hour, member in sorted(matches):
            thumbnail = f"{args.camera}-{day}-{hour}.jpg"
            with Image.open(io.BytesIO(archive.read(member))) as frame:
                image = frame.convert("RGB")
                image.thumbnail((960, 540))
            image.save(args.output / thumbnail, quality=85)
            records.append({"date": day.isoformat(), "hour": hour,
                            "red": measure(image), "file": thumbnail})
    (args.output / "frames.js").write_text("window.cameraFrames = " + json.dumps(records) + ";\n",
                                           encoding="utf-8")
    print(dict(Counter(record["date"] for record in records)))


if __name__ == "__main__":
    main()
