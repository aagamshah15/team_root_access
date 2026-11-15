"""Check that the app's data folder has every field app.js reads, and that the page stays static.

Owner: L04. Run: python app/check_app.py [folder]   (default: app/data if it has JSON, else app/mock)
Stdlib only. Exit code 1 on any problem.

Why: contracts/check.py checks the contract; this checks what the app *actually reads*, plus the
joins it relies on (every decision card has a forecast curve, a what-if row at 0 °C, an evidence row),
and the publishing rules (relative paths only, d3 pinned from cdnjs, no other network calls, < 5 MB).
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

APP = Path(__file__).resolve().parent
READS = {   # file -> row fields app.js reads
    'customers': ['customer_id', 'name', 'tagline', 'rooms'],
    'rooms': ['room', 'display_name', 'customer_id', 'area_m2', 'actual_harvest'],
    'days': ['room', 'today', 'status', 'pct_red_now', 'pct_red_low', 'pct_red_high', 'sellable_share_now', 'model',
             'earliest_sellable_day', 'best_day', 'losses_start_day', 'best_day_low', 'best_day_high',
             'profit_best_m2_day', 'profit_today_m2_day', 'confidence', 'conf_day_range_days', 'conf_agreement',
             'conf_freshness_days', 'conf_reasons', 'weight_complete_day', 'k_x1000'],
    'forecast': ['room', 'today', 'date', 'pct_red', 'pct_red_low', 'pct_red_high', 'sellable_share', 'profit_m2_day',
                 'profit_low', 'profit_high', 'cost_to_date_m2'],
    'whatif': ['room', 'today', 'delta_c', 'best_day', 'days_change', 'profit_best_m2_day', 'profit_change_m2_day',
               'extra_energy_cost_m2_day', 'note'],
    'evidence': ['room', 'date', 'photo', 'photo_usable', 'lamps_on', 'red_index', 'green_pct', 'canopy_distance_mm',
                 'gdd_cum', 'last_sample_date', 'last_sample_pct_red', 'last_sample_fw_g'],
    'alerts': ['room', 'date', 'severity', 'title', 'message', 'numbers'],
    'backtest': ['test', 'method', 'value', 'unit', 'n', 'note'],
    'assumptions': ['name', 'value', 'unit', 'source', 'if_wrong'],
}
D3 = 'https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js'


def check_data(folder: Path) -> list[str]:
    """Fields, joins and size of one data folder."""
    errs: list[str] = []
    docs = {}
    for name, fields in READS.items():
        p = folder / f'{name}.json'
        if not p.exists():
            errs.append(f'{name}.json missing')
            continue
        doc = json.loads(p.read_text())
        docs[name] = doc
        meta = doc.get('meta', {})
        for k in ('source', 'built_at', 'as_of'):
            if k not in meta:
                errs.append(f'{name}.json meta lacks {k}')
        if folder.name == 'mock' and not meta.get('mock'):
            errs.append(f'{name}.json in mock/ lacks "mock": true')
        for i, r in enumerate(doc.get('rows') or []):
            miss = [f for f in fields if f not in r]
            if miss:
                errs.append(f'{name}.json row {i} lacks {miss}')
                break
    if errs:
        return errs
    rooms = {r['room'] for r in docs['rooms']['rows']}
    for c in docs['customers']['rows']:
        for r in c['rooms']:
            if r not in rooms:
                errs.append(f'customer {c["customer_id"]} room {r} not in rooms.json')
    fc = {(r['room'], r['today']) for r in docs['forecast']['rows']}
    wi = {(r['room'], r['today']) for r in docs['whatif']['rows'] if float(r['delta_c']) == 0}
    ev = {(r['room'], r['date']) for r in docs['evidence']['rows']}
    for r in docs['days']['rows']:
        k = (r['room'], r['today'])
        if k not in fc:
            errs.append(f'days {k} has no forecast curve')
        if k not in wi:
            errs.append(f'days {k} has no what-if row at 0 °C')
        if k not in ev:
            errs.append(f'days {k} has no evidence row')
        if len(errs) > 20:
            break
    # The slider uses one step size, so the what-if deltas must be evenly spaced and include 0.
    deltas = sorted({float(r['delta_c']) for r in docs['whatif']['rows']})
    steps = {round(b - a, 6) for a, b in zip(deltas, deltas[1:])}
    if 0.0 not in deltas or len(steps) > 1:
        errs.append(f'what-if deltas not evenly spaced around 0: {deltas}')
    for r in docs['evidence']['rows']:
        if r['photo'] and (r['photo'].startswith('/') or '://' in r['photo']):
            errs.append(f'evidence photo path not relative: {r["photo"]}')
            break
    size = sum(p.stat().st_size for p in folder.rglob('*') if p.is_file() and p.suffix != '.py')
    if size > 5_000_000:   # CLAUDE.md: under 5 MB (decimal), not 5 MiB
        errs.append(f'{folder.name}/ is {size / 1e6:.1f} MB (limit 5 MB)')
    return errs


def check_static() -> list[str]:
    """The page loads only d3 (pinned, cdnjs) from the network and uses relative paths."""
    errs = []
    for f in ('index.html', 'app.js', 'style.css'):
        text = (APP / f).read_text()
        for url in re.findall(r'https?://[^\s"\'`)<>]+', text):
            if url != D3:
                errs.append(f'{f}: unexpected network URL {url}')
        if re.search(r'''(src|href)=["']/''', text):
            errs.append(f'{f}: absolute path in src/href')
    if D3 not in (APP / 'index.html').read_text():
        errs.append('index.html does not load the pinned d3 v7.9.0 from cdnjs')
    if 'Demo customer — replayed 2024 data' not in (APP / 'index.html').read_text():
        errs.append('index.html lacks the demo banner text')
    return errs


def main() -> int:
    if len(sys.argv) > 1:
        folder = Path(sys.argv[1])
    else:
        data = APP / 'data'
        folder = data if any(data.glob('*.json')) else APP / 'mock'
    errs = check_data(folder) + check_static()
    for e in errs:
        print('APP CHECK:', e)
    print(f'app check on {folder.name}/: {"FAILED" if errs else "ok"}')
    return 1 if errs else 0


if __name__ == '__main__':
    sys.exit(main())
