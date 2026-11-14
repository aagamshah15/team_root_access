/* Field log entry (evidence): ruled grey paper, a margin line, the noon photo taped in, lines starting with a
 * gain tick ✓ or a loss flag !. DESIGN.md → Field log entry. Values from evidence.json and days.json only. */
import { useState } from 'react';
import type { DayCard, EvidenceRow } from '../data/types';
import { logDate, pct, short } from '../data/format';
import { AGREE, modelWords } from '../lib/words';

type Line = { ok: boolean | null; text: string };

/** The log lines for one evidence row. `d` adds the agreement and model lines on the "today" entry. */
export function logLines(ev: EvidenceRow, d?: DayCard): Line[] {
  const lines: Line[] = [];
  if (!ev.photo) lines.push({ ok: false, text: `no noon photo${ev.lamps_on ? ' (lamps on)' : ''}` });
  else if (ev.lamps_on) lines.push({ ok: false, text: 'noon photo lamp-lit: purple, not used for colour' });
  else if (!ev.photo_usable) lines.push({ ok: false, text: 'noon photo not usable for colour' });
  else lines.push({ ok: true, text: 'noon photo usable, lamps off' });
  if (ev.red_index != null) lines.push({ ok: null, text: `red fruit in photo ${Number(ev.red_index).toFixed(1)}% of image${ev.green_pct != null ? ` · green leaf ${Number(ev.green_pct).toFixed(1)}%` : ''}` });
  if (ev.canopy_distance_mm != null) lines.push({ ok: null, text: `camera to canopy ${Math.round(ev.canopy_distance_mm)} mm` });
  if (ev.gdd_cum != null) lines.push({ ok: null, text: `warmth since planting ${Math.round(ev.gdd_cum)} degree-days` });
  lines.push(ev.last_sample_date
    ? { ok: true, text: `crop sample ${short(ev.last_sample_date)}: ${pct(ev.last_sample_pct_red)} red${ev.last_sample_fw_g != null ? `, ${Math.round(ev.last_sample_fw_g)} g fruit per pot` : ''}` }
    : { ok: false, text: 'no crop sample yet' });
  if (d) {
    const a = AGREE[d.conf_agreement];
    if (a) lines.push({ ok: d.conf_agreement === 'agree', text: `warmth, photo and sample: ${a[0].toLowerCase()}` });
    lines.push({ ok: null, text: `model used: ${modelWords(d.model).toLowerCase()}` });
  }
  return lines;
}

export function FieldLogEntry({ ev, d, roomName, photoUrl }: { ev: EvidenceRow; d?: DayCard; roomName: string; photoUrl: (p: string | null) => string | null }) {
  const [broken, setBroken] = useState(false);
  const url = photoUrl(ev.photo);
  return (
    <article className="log">
      <div className="log-photo">
        {url && !broken ? (
          <img src={url} alt={`Noon canopy photo of ${roomName} on ${short(ev.date)}`} loading="lazy" onError={() => setBroken(true)} />
        ) : (
          <div className="log-nophoto">{url ? 'photo not available' : 'no photo'}</div>
        )}
      </div>
      <div className="log-lines">
        <div className="log-date">{logDate(ev.date)} · evidence</div>
        {logLines(ev, d).map((l, i) => (
          <div key={i} className="log-line">
            <span className={l.ok === true ? 'tick' : l.ok === false ? 'flag' : 'dot'} aria-hidden="true">{l.ok === true ? '✓' : l.ok === false ? '!' : '·'}</span>
            <span className="sr-only">{l.ok === true ? 'OK: ' : l.ok === false ? 'Flag: ' : ''}</span>
            {l.text}
          </div>
        ))}
      </div>
    </article>
  );
}
