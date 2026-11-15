"""Copy the noon photos the app shows into data/published/photos/, small enough to publish.

Run python scripts/select_photos.py [thumbnail-directory] after extracting the raw camera images.

For each room: noon photos from 15 Oct 2024 to the day before harvest (the harvest-day photo shows empty
tables, so it is dropped), resized to 320 px wide at JPEG quality 70, saved as `<room>_<date>.jpg`.
If the folder ends up over 3 MB, every other day before 25 Oct is removed to make room.
"""
from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from harvest.common import ROOMS, actual_harvest, REPO, load_inputs  # noqa: E402
from harvest.evidence import PHOTOS_DIR, photo_dates, photo_name  # noqa: E402

WIDTH, QUALITY = 320, 70
MAX_BYTES = 3 * 1024 * 1024
THIN_BEFORE = date(2024, 10, 25)


def resize_copy(src: Path, dst: Path) -> None:
    """Save `src` as a WIDTH-px-wide JPEG at `dst`, keeping its aspect ratio."""
    im = Image.open(src).convert('RGB')
    h = round(im.height * WIDTH / im.width)
    im.resize((WIDTH, h), Image.LANCZOS).save(dst, 'JPEG', quality=QUALITY, optimize=True)


def thin_early(paths: list[Path]) -> list[Path]:
    """Files to delete when over budget: every other day before THIN_BEFORE, per room (keeps the first)."""
    drop = []
    for room in ROOMS:
        early = sorted(p for p in paths if p.name.startswith(room + '_')
                       and date.fromisoformat(p.stem.split('_')[1]) < THIN_BEFORE)
        drop += early[1::2]
    return drop


def main() -> int:
    inputs = load_inputs()
    thumbs = Path(sys.argv[1]) if len(sys.argv) > 1 else REPO / 'out' / 'thumbs'
    if not any(thumbs.glob('*.jpg')):
        raise SystemExit(f'No source thumbnails found in {thumbs}')
    PHOTOS_DIR.mkdir(parents=True, exist_ok=True)
    for old in PHOTOS_DIR.glob('*.jpg'):
        old.unlink()
    written, missing = [], []
    for room in ROOMS:
        for day in photo_dates(actual_harvest(inputs, room)):
            src = thumbs / f'{room}_{day.isoformat()}_12.jpg'
            if not src.exists():
                missing.append(src.name)
                continue
            dst = PHOTOS_DIR / photo_name(room, day)
            resize_copy(src, dst)
            written.append(dst)
    total = sum(p.stat().st_size for p in written)
    if total > MAX_BYTES:
        for p in thin_early(written):
            p.unlink()
            written.remove(p)
        total = sum(p.stat().st_size for p in written)
    print(f'select_photos: {len(written)} photos, {total / 1024:.0f} KB in {PHOTOS_DIR}; missing {len(missing)} {missing}')
    return 0 if total <= MAX_BYTES else 1


if __name__ == '__main__':
    sys.exit(main())
