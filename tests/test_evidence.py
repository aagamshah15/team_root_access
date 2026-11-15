"""Tests for harvest/evidence.py and the photo selection rules (scripts/select_photos.py)."""
import importlib.util
import json
from datetime import date, timedelta
from pathlib import Path

from harvest.evidence import evidence_rows, last_sample, photo_dates, photo_usable, room_evidence

REPO = Path(__file__).resolve().parent.parent
FIELDS = ['room', 'date', 'photo', 'photo_usable', 'lamps_on', 'red_index', 'green_pct', 'canopy_distance_mm',
          'gdd_cum', 'last_sample_date', 'last_sample_pct_red', 'last_sample_fw_g']


def _rows(inputs, tmp_path, room='agrifusion'):
    return {r['date']: r for r in room_evidence(inputs, room, photos_dir=tmp_path)}


def test_harvest_day_photo_never_selected():
    # agrifusion's fixture harvest is 2 Dec: photos 15 Oct .. 1 Dec = 17 + 30 + 1 = 48 days
    days = photo_dates(date(2024, 12, 2))
    assert days[0] == date(2024, 10, 15) and days[-1] == date(2024, 12, 1)
    assert date(2024, 12, 2) not in days and len(days) == 48


def test_lamp_lit_frame_not_usable(inputs, tmp_path):
    rows = _rows(inputs, tmp_path)
    # fixture: lamps on at noon every 5th day from planting, so 3 Sep (day 0) is lamp-lit, 4 Sep is not
    assert rows['2024-09-03']['lamps_on'] is True and rows['2024-09-03']['photo_usable'] is False
    assert rows['2024-09-04']['lamps_on'] is False and rows['2024-09-04']['photo_usable'] is True
    assert photo_usable(False, None) is False          # no red index -> not usable
    assert photo_usable(None, 0.5) is False            # lamp state unknown -> not trusted


def test_rows_cover_planting_to_day_before_harvest(inputs, tmp_path):
    rows = room_evidence(inputs, 'agrifusion', photos_dir=tmp_path)
    # 3 Sep .. 1 Dec inclusive = (2 Dec - 3 Sep) = 90 days
    assert len(rows) == 90
    assert rows[0]['date'] == '2024-09-03' and rows[-1]['date'] == '2024-12-01'
    assert all(list(r) == FIELDS for r in rows)


def test_numbers_from_inputs(inputs, tmp_path):
    rows = _rows(inputs, tmp_path)
    r = rows['2024-09-04']
    # agrifusion gains 10 degree-days a day from day 1: 4 Sep is day 2 -> 20; canopy 1400 - 1 = 1399 mm
    assert r['gdd_cum'] == 20.0 and r['canopy_distance_mm'] == 1399.0
    # photo index = max(pct_red - 2, 0) / 10; pct_red at 20 dd is ~0 -> 0.0
    assert r['red_index'] == 0.0 and r['green_pct'] == 5.0


def test_last_sample_is_latest_on_or_before(inputs):
    rip = inputs.ripeness
    assert last_sample(rip, 'agrifusion', date(2024, 10, 6))['last_sample_date'] is None
    assert last_sample(rip, 'agrifusion', date(2024, 10, 21))['last_sample_date'] == '2024-10-07'
    s = last_sample(rip, 'agrifusion', date(2024, 11, 5))
    # 5 Nov is day 63 -> g = 10 * 64 = 640; % red = 100 / (1 + exp(-0.03 * (640 - 750))) = 100 / (1 + e^3.3)
    #   = 100 / 28.11 = 3.56; mean fruit weight 300 g in the fixture
    assert s == {'last_sample_date': '2024-11-05', 'last_sample_pct_red': 3.56, 'last_sample_fw_g': 300.0}


def test_photo_path_only_when_selected(inputs, tmp_path):
    (tmp_path / 'agrifusion_2024-10-20.jpg').write_bytes(b'x')
    rows = _rows(inputs, tmp_path)
    assert rows['2024-10-20']['photo'] == 'data/photos/agrifusion_2024-10-20.jpg'
    assert rows['2024-10-21']['photo'] is None


def test_all_rooms_json_safe(inputs, tmp_path):
    rows = evidence_rows(inputs, photos_dir=tmp_path)
    assert {r['room'] for r in rows} == set(inputs.daily.room)
    json.dumps(rows, allow_nan=False)


def test_thin_early_keeps_every_other_day_before_25_oct():
    spec = importlib.util.spec_from_file_location('select_photos', REPO / 'scripts' / 'select_photos.py')
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    paths = [Path(f'mugrow_{date(2024, 10, 15) + timedelta(days=i)}.jpg') for i in range(12)]   # 15..26 Oct
    # early files are 15..24 Oct (10 files); every other one after the first is dropped: 16, 18, 20, 22, 24
    assert [p.stem[-2:] for p in mod.thin_early(paths)] == ['16', '18', '20', '22', '24']
