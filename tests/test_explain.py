"""Tests for harvest/explain.py: the "How is this worked out?" text (explain.json)."""
import json
import re
from datetime import date

import pytest

from harvest.common import REPO
from harvest.explain import KPIS, display, expand, meta_block

CONTRACT = ['room', 'today', 'kpi', 'meaning', 'steps', 'inputs', 'caveats']


def test_display_hand_checks():
    assert display('2024-11-11', 'date') == 'Mon 11 Nov'
    assert display(date(2024, 11, 3), 'date') == 'Sun 3 Nov'
    assert display(34.24, 'pct') == '34%'
    assert display(0.957, 'share') == '96%'           # 95.7 -> 96
    assert display(0.0581, 'eur_m2_day') == '€0.058 per m² per day'
    assert display(38.813, 'eur_m2') == '€38.81 per m²'
    assert display(1, 'days') == '1 day' and display(7, 'days') == '7 days'
    assert display(None, 'date') == 'not within the forecast'
    assert display(56.0, 'num') == '56'


def _toy():
    """A tiny card + row; profit: (53.77 - 38.81) / 68 = 14.96 / 68 = 0.220 €/m²/day."""
    from harvest.common import load_settings
    meta = json.loads(json.dumps(meta_block(load_settings())))   # as the app reads it (JSON round trip)
    card = dict(room='ideas', today='2024-11-06', model='warmth+sample', pct_red_now=43.5, pct_red_low=22.0,
                pct_red_high=67.0, sellable_share_now=0.8, best_day='2024-11-09', best_day_low='2024-11-06',
                best_day_high='2024-11-12', optimal_from='2024-11-08', optimal_to='2024-11-12', look_day='2024-11-10',
                profit_best_m2_day=0.22, profit_today_m2_day=0.06, confidence='medium', conf_day_range_days=7,
                conf_agreement='mixed', conf_freshness_days=1, conf_reasons=['a', 'b'], conf_day_range_level='high',
                conf_agreement_level='medium', conf_freshness_level='high', weight_complete_day='2024-11-05')
    row = dict(room='ideas', today='2024-11-06', values=dict(
        gdd_rate=11.0, fruit_weight_g=287.5, density=30.0, cost_rate_m2_day=0.272, price_per_pot=1.7924,
        revenue_m2=53.77, cost_to_date_m2=38.81, net_m2=14.96, days_grown=68, spread_sd=12.5, spread_fitted=True,
        transit_days=2, pluck_day='2024-11-07', pluck_reason='sellable', ship_by_day='2024-11-10'))
    return meta, row, card


def test_expand_gives_contract_rows_with_filled_steps():
    meta, row, card = _toy()
    out = expand(meta, row, card)
    assert [r['kpi'] for r in out] == KPIS
    for r in out:
        assert list(r) == CONTRACT
        assert r['meaning'] and r['steps'] and r['caveats']
        assert all(set(i) == {'name', 'value', 'unit', 'source'} for i in r['inputs'])
        assert not any(re.search(r'\{\w+\}', s) for s in r['steps'])   # every placeholder filled
    by = {r['kpi']: r for r in out}
    assert 'Sat 9 Nov' in by['best_day']['steps'][3]
    assert 'Fri 8 Nov to Tue 12 Nov' in by['best_day']['steps'][4]
    # a room losing money on its best day has no zone, and the step says so
    loss = expand(meta, row, dict(card, profit_best_m2_day=-0.01, optimal_from=None, optimal_to=None))
    assert loss[0]['steps'][4].startswith('No optimal harvest zone today')
    assert '€14.96 per m² divided by 68 days grown = €0.220 per m² per day' in by['profit_best']['steps'][2]
    assert 'Sun 10 Nov' in by['look_day']['steps'][-1]
    assert 'Thu 7 Nov, because enough pots would sell on arrival' in by['ship_day']['steps'][-1]
    assert by['pots_ready']['inputs'][1]['source'].startswith("Other five rooms' full-season")


def test_published_explain_matches_cards():
    """Real build: every room-day expands cleanly, and the numbers agree with days.json (no new maths)."""
    p = REPO / 'app' / 'data' / 'explain.json'
    if not p.exists():
        pytest.skip('app/data/explain.json not built yet')
    ex = json.loads(p.read_text())
    cards = {(r['room'], r['today']): r for r in json.loads((REPO / 'app' / 'data' / 'days.json').read_text())['rows']}
    assert len(ex['rows']) == len(cards)
    for row in ex['rows']:
        card = cards[(row['room'], row['today'])]
        rows = expand(ex['meta'], row, card)
        assert len(rows) == len(KPIS)
        v = row['values']
        # profit on the best day = net profit per m² / days grown (card rounded to 3 places)
        assert v['net_m2'] / v['days_grown'] == pytest.approx(card['profit_best_m2_day'], abs=6e-4)
        # price per pot is published to 4 places: up to 56 pots x 0.00005 = 0.003 of rounding
        assert v['density'] * v['price_per_pot'] == pytest.approx(v['revenue_m2'], rel=1e-3, abs=0.003)
