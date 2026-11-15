"""Check published app files against contracts/app-data.md.

Owner: integrator. Run: python contracts/check.py [folder]
Checks app/data/ if it has files, else app/mock/; skips quietly if neither exists yet.
Exit code 1 on any mismatch.
"""
import json
import math
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
FIELDS = {
    'customers': ['customer_id', 'name', 'tagline', 'rooms'],
    'rooms': ['room', 'display_name', 'customer_id', 'area_m2', 'planted', 'actual_harvest'],
    'days': ['room', 'today', 'status', 'pct_red_now', 'pct_red_low', 'pct_red_high', 'sellable_share_now', 'model',
             'earliest_sellable_day', 'best_day', 'losses_start_day', 'best_day_low', 'best_day_high',
             'profit_best_m2_day', 'profit_today_m2_day', 'confidence', 'conf_day_range_days', 'conf_agreement',
             'conf_freshness_days', 'conf_reasons', 'weight_complete_day', 'k_x1000',
             'optimal_from', 'optimal_to', 'look_day', 'pot_spread_sd'],
    'forecast': ['room', 'today', 'date', 'pct_red', 'pct_red_low', 'pct_red_high', 'sellable_share', 'profit_m2_day',
                 'profit_low', 'profit_high', 'cost_to_date_m2'],
    'whatif': ['room', 'today', 'delta_c', 'best_day', 'days_change', 'profit_best_m2_day', 'profit_change_m2_day',
               'extra_energy_cost_m2_day', 'note'],
    'evidence': ['room', 'date', 'photo', 'photo_usable', 'lamps_on', 'red_index', 'green_pct', 'canopy_distance_mm',
                 'gdd_cum', 'last_sample_date', 'last_sample_pct_red', 'last_sample_fw_g'],
    'alerts': ['room', 'date', 'kind', 'severity', 'title', 'message', 'numbers'],
    'backtest': ['test', 'method', 'value', 'unit', 'n', 'note'],
    'assumptions': ['name', 'value', 'unit', 'source', 'if_wrong'],
    'explain': ['room', 'today', 'values'],   # compact shape (wave 2): texts in meta.kpis, values per row
    'shipping': ['room', 'today', 'destination', 'pluck_day', 'pluck_reason', 'ship_by_day', 'pct_at_pluck',
                 'pct_on_arrival', 'sellable_on_arrival', 'best_from', 'best_until', 'sell_until', 'profit_m2_day',
                 'best_profit_day', 'profit_best_m2_day'],
}
ENUMS = {
    ('days', 'status'): {'harvest_now', 'plan_harvest', 'keep_growing', 'check_crop'},
    ('days', 'confidence'): {'high', 'medium', 'low'},
    ('days', 'conf_agreement'): {'agree', 'mixed', 'conflict'},
    ('days', 'model'): {'warmth', 'warmth+sample', 'warmth+camera', 'warmth+camera+sample'},
    ('alerts', 'kind'): {'behind_schedule', 'ahead_of_schedule', 'sensor_check', 'room_drift'},
    ('alerts', 'severity'): {'info', 'warning'},
    ('shipping', 'pluck_reason'): {'weight', 'sellable', 'today'},
}


def check_folder(folder: Path) -> list[str]:
    errors = []
    for name, fields in FIELDS.items():
        p = folder / f'{name}.json'
        if not p.exists():
            errors.append(f'{name}.json missing')
            continue
        doc = json.loads(p.read_text())
        meta, rows = doc.get('meta', {}), doc.get('rows')
        for k in ('source', 'built_at', 'as_of'):
            if k not in meta:
                errors.append(f'{name}.json meta lacks {k}')
        if folder.name == 'data' and meta.get('mock'):
            errors.append(f'{name}.json in app/data is mock data')
        if not isinstance(rows, list) or not rows:
            errors.append(f'{name}.json has no rows')
            continue
        for i, r in enumerate(rows):
            missing = [f for f in fields if f not in r]
            if missing:
                errors.append(f'{name}.json row {i} lacks {missing}')
                break
            bad = [f for f, v in r.items() if isinstance(v, float) and not math.isfinite(v)]
            if bad:
                errors.append(f'{name}.json row {i} has non-finite {bad}')
                break
            for (fname, field), allowed in ENUMS.items():
                if fname == name and r.get(field) not in allowed:
                    errors.append(f'{name}.json row {i} {field}={r.get(field)!r} not in {sorted(allowed)}')
                    break
    return errors


def main():
    if len(sys.argv) > 1:
        folder = Path(sys.argv[1]).resolve()
    else:
        data, mock = REPO / 'app' / 'data', REPO / 'app' / 'mock'
        folder = data if any(data.glob('*.json')) else mock
    if not any(folder.glob('*.json')):
        print(f'contract check: nothing to check yet ({folder.relative_to(REPO)})')
        return 0
    errors = check_folder(folder)
    for e in errors:
        print('CONTRACT:', e)
    print(f'contract check on {folder.relative_to(REPO)}: {"FAILED" if errors else "ok"}')
    return 1 if errors else 0


if __name__ == '__main__':
    sys.exit(main())
