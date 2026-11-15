"""Plain-English explanations for every KPI on a room card: the "How is this worked out?" panel (L09, wave 2).

No new maths: every value here is one the pipeline already computed for the same room and "today" (the
decision card in days.json, the profit curve, the fit, the default-destination shipping plan).

Size (CLAUDE.md: app/data under 5 MB). Writing the full text on every room x today x KPI row would add
about 1.5 MB, so explain.json is stored compactly:
  meta.kpis[kpi] = {title, meaning, steps, inputs, caveats}  -- the text, written once per KPI.
      `steps` are templates with {key} placeholders; `inputs` are {name, key, unit, kind, source}.
  rows = one per room x today: {room, today, values}  -- only the numbers the days.json card lacks.
A placeholder or input key is looked up in the row's `values`, then in the room's days.json card for the
same today. `expand(meta, row, card)` turns that into the contract shape, one dict per KPI:
  {room, today, kpi, meaning, steps, inputs: [{name, value, unit, source}], caveats}
and `display(value, kind)` is the formatting rule (dates "Mon 11 Nov", shares as %, euros to 3 places).
"""
from __future__ import annotations

from datetime import date

KPIS = ['best_day', 'pots_ready', 'profit_best', 'confidence', 'look_day', 'ship_day']

MODEL_WORDS = {'warmth': 'warmth since planting only',
               'warmth+sample': 'warmth since planting, adjusted to the latest crop sample',
               'warmth+camera': 'warmth since planting, timed by the canopy camera',
               'warmth+camera+sample': 'warmth since planting, timed by the canopy camera and adjusted to the latest crop sample'}
REASON_WORDS = {'weight': 'the fruit has finished gaining weight', 'sellable': 'enough pots would sell on arrival',
                'today': 'everything is already in place today', 'beyond_forecast': 'that is beyond the 21-day forecast'}
SRC_DATA = 'Room climate and cost log (dataset)'
SRC_FIT = ('Ripening curve learned from the other five rooms, placed with this room\'s own warmth, photos '
           'and crop samples; all data up to today')
SRC_RULES = 'Challenge rules, Maree et al. 2025 (verified)'
SRC_TEAM = 'Team setting, config/crop.yaml'


def _inp(name, key, kind, unit, source):
    return dict(name=name, key=key, kind=kind, unit=unit, source=source)


def kpi_text(settings: dict) -> dict:
    """The text for each KPI, written once (meta.kpis). Settings values are filled in here; room-day values stay
    as {key} placeholders."""
    e, lg = settings['economics'], settings['logistics']
    need = round(100 * e['earliest_sellable_share'])
    third = 'one third'
    lo, hi = lg['best_band_pct_red']
    dest = next(d for d in lg['destinations'] if d['id'] == lg['default_destination'])
    return {
        'best_day': dict(
            title='Best harvest day',
            meaning='The day we estimate harvesting this room earns the most profit per m² for each day the crop has grown.',
            steps=['Estimate how red the fruit is each day for the next 21 days, using {model_words}. '
                   'Today: about {pct_red_now} red; future warmth is taken as {gdd_rate} a day, the average of the last 7 days.',
                   f'For each day, estimate the share of pots ready to sell (a pot sells once {third} of its fruit weight is red).',
                   'For each day, estimate profit: what the pots would sell for (fruit {fruit_weight_g} a pot, {density} pots per m²) '
                   'minus all costs so far and the daily running cost of {cost_rate_m2_day}, divided by the days grown.',
                   f'Pick the most profitable day among days with at least {need}% of pots ready to sell: {{best_day}}. '
                   'If the crop ripens a little faster or slower, the best day falls between {best_day_low} and {best_day_high}.',
                   '{zone_sentence}'],
            inputs=[_inp('Fruit red today (estimated)', 'pct_red_now', 'pct', '% of fruit weight', SRC_FIT),
                    _inp('Ripening model used', 'model_words', 'text', '', SRC_FIT),
                    _inp('Warmth per day ahead', 'gdd_rate', 'dd_day', 'degree-days a day', SRC_DATA + ', last 7 days'),
                    _inp('Fruit weight per pot', 'fruit_weight_g', 'g', 'g', 'Latest crop sample on or before today (dataset)'),
                    _inp('Pots per m²', 'density', 'num', 'pots per m²', 'Room log (dataset)'),
                    _inp('Running cost per day', 'cost_rate_m2_day', 'eur_m2_day', '€ per m² per day', SRC_DATA + ', last 7 days'),
                    _inp('Pots ready to sell needed', 'need_share', 'share', 'share of pots', SRC_TEAM),
                    _inp('Optimal zone: profit at least', 'zone_share', 'share', "of the best day's profit", 'Team setting, approved by the user (D16)')],
            caveats=['Profit on days other than the actual harvest is a model estimate; each room was harvested once.',
                     'A cold or warm spell ahead moves the best day by a day or two.',
                     'Fruit dry matter (part of the real price) is not measured, so the lower price line is used.']),
        'pots_ready': dict(
            title='Pots ready to sell today',
            meaning=f'The share of pots that would sell if the room were harvested today; a pot sells once {third} of its fruit weight is red.',
            steps=['Estimate how red the room is today: about {pct_red_now} of fruit weight (likely range {pct_red_low} to {pct_red_high}).',
                   'Pots ripen at different speeds, so spread the pots around that figure: plants differ by about {spread_sd} '
                   'points of % red mid-ripening.',
                   f'Count the pots at or above {third} red: {{sellable_share_now}} of pots.'],
            inputs=[_inp('Fruit red today (estimated)', 'pct_red_now', 'pct', '% of fruit weight', SRC_FIT),
                    _inp('Plant-to-plant spread', 'spread_sd', 'num', 'points of % red', '{spread_source}'),
                    _inp('Pot sells once red share reaches', 'sellable_red_share', 'share', 'of fruit weight', SRC_RULES)],
            caveats=['The spread comes from hand weighings of six plants per room.',
                     'The camera sees the top of the canopy only; hidden fruit may be greener or redder.']),
        'profit_best': dict(
            title='Profit on the best day',
            meaning='Estimated net profit per m² for each day grown, if the room is harvested on its best day.',
            steps=['Sales: {density} pots per m² at about {price_per_pot} a pot (red fruit grams on the challenge price chart, '
                   'unsellable pots earn nothing) = {revenue_m2}.',
                   'Costs up to the best day: plants, energy, fixed costs and re-spacing = {cost_to_date_m2}.',
                   'Net profit {net_m2} divided by {days_grown} days grown = {profit_best_m2_day}.',
                   'For comparison, harvesting today gives {profit_today_m2_day}.'],
            inputs=[_inp('Pots per m²', 'density', 'num', 'pots per m²', 'Room log (dataset)'),
                    _inp('Average sale per pot', 'price_per_pot', 'eur', '€ per pot', SRC_RULES + ', price chart'),
                    _inp('Costs so far at the best day', 'cost_to_date_m2', 'eur_m2', '€ per m²', SRC_DATA),
                    _inp('Days grown at the best day', 'days_grown', 'num', 'days since planting', 'Planting date (config/customers.yaml)'),
                    _inp('Plant cost', 'plant_cost', 'eur', '€ per pot', SRC_RULES)],
            caveats=['Harvest labour is not costed.', 'Future daily cost is taken as the average of the last 7 days.',
                     'The low and high profit band covers faster or slower ripening and the higher price line.']),
        'confidence': dict(
            title='How sure we are',
            meaning='How much to trust the best day, from three checks; the overall level is the weakest of the three.',
            steps=['Day range: the likely range of the best day is {conf_day_range_days} wide ({conf_day_range_level}).',
                   'Agreement: do the warmth model, the camera and the latest crop sample agree on ripeness today? '
                   '{conf_agreement} ({conf_agreement_level}).',
                   'Freshness: the older of the newest crop sample and the newest usable photo is {conf_freshness_days} old ({conf_freshness_level}).',
                   'Overall: {confidence}, the weakest of the three. Why: {conf_reasons}.'],
            inputs=[_inp('Day range', 'conf_day_range_days', 'days', 'days', 'Spread of the other five rooms\' ripening timing'),
                    _inp('Day range for high / medium', 'range_limits', 'text', 'days', SRC_TEAM + ' (D11)'),
                    _inp('Agreement', 'conf_agreement', 'text', '', 'Warmth model, camera and crop sample'),
                    _inp('Freshness', 'conf_freshness_days', 'days', 'days', 'Crop weighings and noon photos (dataset)'),
                    _inp('Freshness for high / medium', 'fresh_limits', 'text', 'days', SRC_TEAM + ' (D11)')],
            caveats=['Six rooms and one season: the day range is learned from only five other rooms.',
                     'Lamp-lit photos are not used for colour, so a room under lamps at noon can look stale.']),
        'look_day': dict(
            title='Best shelf look',
            meaning=f'The first day the room is estimated to reach {lo}% red, where pots start to look their best ({lo}–{hi}% red).',
            steps=['Start from today\'s estimate: about {pct_red_now} of fruit weight red.',
                   'Move forward day by day at {gdd_rate} of warmth a day on the room\'s ripening curve.',
                   f'The first day at or above {lo}% red: {{look_day}}.'],
            inputs=[_inp('Fruit red today (estimated)', 'pct_red_now', 'pct', '% of fruit weight', SRC_FIT),
                    _inp('Warmth per day ahead', 'gdd_rate', 'dd_day', 'degree-days a day', SRC_DATA + ', last 7 days'),
                    _inp('Best look starts at', 'band_low', 'pct', '% of fruit weight red', 'Team assumption, config/crop.yaml')],
            caveats=[f'The {lo}–{hi}% "best look" band is a team assumption, not measured in the dataset.',
                     'Pots differ; some reach the band a few days before or after the room as a whole.']),
        'ship_day': dict(
            title=f'Best day to pluck for {dest["name"]}',
            meaning=f'The day to pluck pots for {dest["name"]} so no fruit weight is lost, the pots sell on arrival, '
                    'and they stay in best condition on the shelf as long as possible.',
            steps=['Fruit stops gaining weight on {weight_complete_day} (98% of final weight; curve shape from the other five rooms\' full season, timing from their weighings up to today).',
                   f'{dest["name"]} is about {dest["distance_km"]} km away: {{transit_days}} on the road in a '
                   f'{lg["transit_temp_c"]:g} °C truck, where pots keep ripening slowly.',
                   f'Pots must arrive with at least {need}% ready to sell, judged by the buyer on delivery.',
                   'Pluck day = the latest of those and today: {pluck_day}, because {pluck_reason_words}. '
                   'Ship no later than {ship_by_day} to leave at least {min_shelf} in best condition.'],
            inputs=[_inp('Fruit finished growing', 'weight_complete_day', 'date', '', 'Growth curve fitted on the other rooms\' weighings up to today'),
                    _inp('Days on the road', 'transit_days', 'days', 'days', 'Distance and truck settings, config/crop.yaml'),
                    _inp('Truck temperature', 'truck_temp', 'c', '°C', 'Common practice for partly ripe tomato'),
                    _inp('Pluck day', 'pluck_day', 'date', '', 'Shipping plan (shipping.json)'),
                    _inp('Ship by', 'ship_by_day', 'date', '', 'Shipping plan (shipping.json)')],
            caveats=['Distances are approximate road distances, not route-planned; freight cost is not included.',
                     'Ripening in the truck and shop follows the greenhouse warmth clock (an assumption).']),
    }


def room_day_values(card: dict, curve, params: dict, ship: dict | None, settings: dict, spread: dict) -> dict:
    """The numbers one room x today needs beyond its days.json card (row `values`). No new maths: read off
    the profit curve at the best day, the fit, and the default-destination shipping plan."""
    e = settings['economics']
    best = curve[curve.date == card['best_day']].iloc[0]
    now = curve.iloc[0]
    v = dict(gdd_rate=params['gdd_rate'], fruit_weight_g=float(now.fruit_weight_g), density=float(now.density),
             cost_rate_m2_day=float(curve.cost_to_date_m2.iloc[1] - curve.cost_to_date_m2.iloc[0]) if len(curve) > 1 else None,
             price_per_pot=float(best.revenue_m2 / best.density), revenue_m2=float(best.revenue_m2),
             cost_to_date_m2=float(best.cost_to_date_m2), net_m2=float(best.revenue_m2 - best.cost_to_date_m2),
             days_grown=int(best.days_grown), spread_sd=spread['sd'], spread_fitted=spread['fitted'])
    if ship is not None:
        v.update(transit_days=ship['transit_days'], pluck_day=ship['pluck_day'], pluck_reason=ship['pluck_reason'],
                 ship_by_day=ship['ship_by_day'])
    return v


# ---------------------------------------------------------------- reading it back (contract shape)

def display(v, kind: str) -> str:
    """How a value reads in a sentence. Hand checks: date 2024-11-11 -> 'Mon 11 Nov'; pct 34.24 -> '34%';
    share 0.957 -> '96%'; days 1 -> '1 day'; eur_m2_day 0.0581 -> '€0.058 per m² per day'; None -> 'not within the forecast'."""
    if v is None:
        return 'not within the forecast'
    if kind == 'date':
        d = v if isinstance(v, date) else date.fromisoformat(str(v))
        return d.strftime('%a %d %b').replace(' 0', ' ')
    if kind == 'pct':
        return f'{float(v):.0f}%'
    if kind == 'share':
        return f'{100 * float(v):.0f}%'
    if kind == 'eur_m2_day':
        return f'€{float(v):.3f} per m² per day'
    if kind == 'eur_m2':
        return f'€{float(v):.2f} per m²'
    if kind == 'eur':
        return f'€{float(v):.2f}'
    if kind == 'g':
        return f'{float(v):.0f} g'
    if kind == 'dd_day':
        return f'{float(v):.1f} degree-days'
    if kind == 'c':
        return f'{float(v):g} °C'
    if kind == 'days':
        n = int(round(float(v)))
        return f'{n} day' + ('' if n == 1 else 's')
    if kind == 'list':
        return '; '.join(str(x) for x in v)
    if isinstance(v, float):
        return f'{v:.1f}'.rstrip('0').rstrip('.')
    return str(v)


# Kind of every placeholder that is not an input (card fields and derived words).
KINDS = dict(best_day='date', best_day_low='date', best_day_high='date', optimal_from='date', optimal_to='date',
             look_day='date', weight_complete_day='date', pluck_day='date', ship_by_day='date',
             pct_red_low='pct', pct_red_high='pct', sellable_share_now='share',
             revenue_m2='eur_m2', net_m2='eur_m2', profit_best_m2_day='eur_m2_day', profit_today_m2_day='eur_m2_day',
             conf_reasons='list', days_grown='num', min_shelf='days')


def lookup(key: str, values: dict, card: dict, consts: dict):
    """A key's value: the row's values first, then the days.json card, then meta.constants."""
    for src in (values, card, consts):
        if key in src:
            return src[key]
    raise KeyError(key)


def expand(meta: dict, row: dict, card: dict) -> list[dict]:
    """explain.json row + its days.json card -> the six contract rows (contracts/app-data.md, explain.json)."""
    consts = dict(meta['constants'])
    consts['model_words'] = MODEL_WORDS.get(card.get('model'), card.get('model'))
    consts['pluck_reason_words'] = REASON_WORDS.get(row['values'].get('pluck_reason'), 'there is no plan yet')
    zone = round(100 * (1 - float(consts['zone_share'])))
    consts['zone_sentence'] = (
        f'No optimal harvest zone today: even the best day is estimated to lose money, so "within {zone}% of '
        'the best day\'s profit" has no meaning.' if card.get('optimal_from') is None else
        f'Days within {zone}% of the best day\'s profit make the optimal harvest zone: '
        f'{display(card["optimal_from"], "date")} to {display(card["optimal_to"], "date")}.')
    consts['spread_source'] = meta['spread_sources']['fitted' if row['values'].get('spread_fitted') else 'setting']
    kinds = dict(KINDS)
    for k in meta['kpis'].values():
        kinds.update({i['key']: i['kind'] for i in k['inputs']})

    def fmt(key):
        return display(lookup(key, row['values'], card, consts), kinds.get(key, 'text'))

    class _Fmt(dict):
        def __missing__(self, key):
            return fmt(key)

    out = []
    for kpi in KPIS:
        t = meta['kpis'][kpi]
        out.append(dict(room=row['room'], today=row['today'], kpi=kpi, meaning=t['meaning'],
                        steps=[s.format_map(_Fmt()) for s in t['steps']],
                        inputs=[dict(name=i['name'], value=lookup(i['key'], row['values'], card, consts),
                                     unit=i['unit'], source=i['source'].format_map(_Fmt())) for i in t['inputs']],
                        caveats=list(t['caveats'])))
    return out


def meta_block(settings: dict) -> dict:
    """meta for explain.json: the KPI text, settings-based constants and how to read the rows."""
    e, lg, c = settings['economics'], settings['logistics'], settings['confidence']
    return dict(
        how_to_read=('One row per room x today. Fill each step\'s {key} from the row\'s values, then the room\'s '
                     'days.json card for the same today, then meta.constants. Dates read like "Mon 11 Nov", shares '
                     'and % red as whole percents, money in euros (see harvest/explain.py display()).'),
        kpis=kpi_text(settings),
        constants=dict(need_share=e['earliest_sellable_share'], zone_share=e['optimal_zone_share'],
                       sellable_red_share=e['sellable_red_share'], plant_cost=e['plant_cost_eur'],
                       band_low=lg['best_band_pct_red'][0], truck_temp=lg['transit_temp_c'],
                       min_shelf=lg['min_best_shelf_days'],
                       range_limits=f"high ≤ {c['day_range_high_max']}, medium ≤ {c['day_range_medium_max']}",
                       fresh_limits=f"high ≤ {c['fresh_high_max']}, medium ≤ {c['fresh_medium_max']}"),
        spread_sources={'fitted': 'Other five rooms\' full-season crop weighings, standing in for the grower\'s previous crop (dataset)',
                        'setting': 'Setting, config/crop.yaml (the fit on the other rooms failed)'},
    )
