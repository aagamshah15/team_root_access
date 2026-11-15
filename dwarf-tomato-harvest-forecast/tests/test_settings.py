"""Checks on config/crop.yaml (lane L05): it loads, keeps every fixture key, values are sane,
and the paper-verified price curve reproduces the paper's published gains."""
from pathlib import Path

import numpy as np
import pytest
import yaml

REPO = Path(__file__).resolve().parents[1]
CONFIG = REPO / 'config' / 'crop.yaml'
FIXTURE = REPO / 'tests' / 'fixtures' / 'crop.yaml'


def _load(p):
    with open(p) as f:
        return yaml.safe_load(f)


def _keys(d, prefix=''):
    """All dotted key paths in a nested dict, e.g. 'economics.red_cap_g'."""
    out = set()
    for k, v in d.items():
        path = f'{prefix}{k}'
        out.add(path)
        if isinstance(v, dict):
            out |= _keys(v, path + '.')
    return out


def _get(d, dotted):
    for part in dotted.split('.'):
        d = d[part]
    return d


@pytest.fixture(scope='module')
def cfg():
    return _load(CONFIG)


def test_has_every_fixture_key(cfg):
    missing = _keys(_load(FIXTURE)) - _keys(cfg)
    assert not missing, f'crop.yaml lacks fixture keys: {sorted(missing)}'


def test_values_in_sane_ranges(cfg):
    e, r, c = cfg['economics'], cfg['ripeness'], cfg['confidence']
    assert 5 <= cfg['base_temp_c'] <= 12
    assert 0 < e['sellable_red_share'] < 1
    assert 50 <= e['red_cap_g'] <= 500
    assert 0 < e['price_low'] <= e['price_eur_per_pot'] <= e['price_high'] < 10
    assert 0 < e['plant_cost_eur'] < e['price_eur_per_pot']
    for curve in (e['gains_curve_low'], e['gains_curve_high']):
        grams = [g for g, _ in curve]
        assert grams == sorted(grams) and curve[-1][0] == e['red_cap_g']
    assert e['gains_curve_low'][-1][1] == e['price_eur_per_pot']
    assert e['gains_curve_high'][-1][1] == e['price_high']
    assert 0 < e['respacing_cost_eur_m2_year'] < 10
    assert 0.5 <= e['earliest_sellable_share'] <= 1
    assert 0.5 <= e['harvest_now_share'] <= e['earliest_sellable_share']
    assert e['area_m2'] == 96.0                      # paper §2.2
    assert 0 <= r['sample_weight'] <= 1
    assert 1 <= r['rate_days'] <= 30 and 7 <= r['horizon_days'] <= 60
    assert c['day_range_high_max'] < c['day_range_medium_max']
    assert c['agree_points'] < c['conflict_points']
    assert c['fresh_high_max'] < c['fresh_medium_max']


def test_assumption_keys_resolve(cfg):
    """Every assumption row points at a real setting, so the app never shows a typed-twice number."""
    for a in cfg['assumptions']:
        assert {'name', 'key', 'unit', 'source', 'if_wrong'} <= set(a), a
        assert isinstance(_get(cfg, a['key']), (int, float)), a['key']


def _price(cfg, red_g, dry_matter_pct):
    """Price per pot from the paper's Fig. 3 lines: interpolate by red grams, then by dry matter 7 -> 8 %."""
    e = cfg['economics']
    lo_pts, hi_pts = np.array(e['gains_curve_low']), np.array(e['gains_curve_high'])
    lo = np.interp(red_g, lo_pts[:, 0], lo_pts[:, 1])
    hi = np.interp(red_g, hi_pts[:, 0], hi_pts[:, 1])
    w = min(max(dry_matter_pct - 7.0, 0.0), 1.0)
    return lo + w * (hi - lo)


def test_price_curve_reproduces_paper_table1_gains(cfg):
    """Paper Table 1 gains per pot = price - EUR 0.75 plant cost; all rooms had > 150 g red fruit.
    Hand-worked: MuGrow dry matter 7.3 % -> 1.80 + 0.3 * (2.00 - 1.80) = 1.86; 1.86 - 0.75 = 1.11 (Table 1: 1.11).
    Agrifusion 7.2 % -> 1.84 - 0.75 = 1.09 (Table 1: 1.09). IDEAS 6.8 % -> 1.80 - 0.75 = 1.05 (Table 1: 1.05)."""
    plant = cfg['economics']['plant_cost_eur']
    table1 = {'ideas': (219, 6.8, 1.05), 'mugrow': (252, 7.3, 1.11), 'trigger': (268, 5.9, 1.05),
              'reference': (275, 6.6, 1.05), 'agrifusion': (258, 7.2, 1.09), 'tomatonuts': (283, 6.0, 1.05)}
    for room, (red_g, dm, gains) in table1.items():
        assert _price(cfg, red_g, dm) - plant == pytest.approx(gains, abs=0.005), room


def test_price_curve_shape(cfg):
    """Below 50 g nothing; 65 g is halfway 50->80: 0.5 * 1.60 = 0.80; at 80 g EUR 1.60 (low dry matter);
    115 g is halfway 80->150: 1.60 + 0.5 * 0.20 = 1.70; above the cap the full price."""
    assert _price(cfg, 40, 6.5) == 0.0
    assert _price(cfg, 65, 6.5) == pytest.approx(0.80)
    assert _price(cfg, 80, 6.5) == pytest.approx(1.60)
    assert _price(cfg, 115, 6.5) == pytest.approx(1.70)
    assert _price(cfg, 400, 6.5) == pytest.approx(cfg['economics']['price_eur_per_pot'])
