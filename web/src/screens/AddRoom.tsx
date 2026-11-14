/**
 * "Add a room" screen (lane L10, decision D17).
 *
 * A grower registers a new room: name, area, planting date (required) and the data
 * files. Every file is read and checked here in the browser against
 * docs/input-contract.md; nothing is uploaded. On submit the room is kept as a draft
 * in this browser only, and the screen says plainly that the forecast itself is made
 * by the team's pipeline.
 *
 * Default export, no required props, so the app shell (L07) can mount it at its route.
 */
import { useId, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import {
  checkClimateLog,
  checkPhotos,
  checkPlantWeighings,
  checkRoom,
  daysBetween,
  formatDate,
  isoDate,
  isReady,
  localToday,
  type FileCheck,
  type Finding,
} from "../lib/validate";
import { clearDraft, loadDraft, saveDraft, type DraftFile, type RoomDraft } from "./AddRoomStore";
import "./AddRoom.css";

export interface AddRoomProps {
  /** "Today" as yyyy-mm-dd; defaults to the browser's date. Tests pass a fixed day. */
  today?: string;
}

/** A file the grower picked: its name and text (CSV), kept in memory only. */
interface PickedFile {
  name: string;
  text: string;
}

/** Read a File's text. Uses File.text() where available, FileReader otherwise. */
function readText(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

type FieldKey = "name" | "area" | "plantingDate" | "climate" | "plants" | "photos";

export default function AddRoom({ today: todayProp }: AddRoomProps = {}) {
  const today = todayProp ?? localToday();
  const [saved, setSaved] = useState<RoomDraft | null>(() => loadDraft());
  const [storageOk, setStorageOk] = useState(true);
  const [name, setName] = useState("");
  const [area, setArea] = useState("");
  const [plantingDate, setPlantingDate] = useState("");
  const [climateFile, setClimateFile] = useState<PickedFile | null>(null);
  const [plantsFile, setPlantsFile] = useState<PickedFile | null>(null);
  const [photoNames, setPhotoNames] = useState<string[]>([]);
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const planted = isoDate(plantingDate) ?? undefined;

  // File checks re-run when the planting date or room name changes (they depend on both).
  const climate = useMemo<FileCheck | undefined>(() => (climateFile ? checkClimateLog(climateFile.text, name, today) : undefined), [climateFile, name, today]);
  const plants = useMemo<FileCheck | undefined>(() => (plantsFile ? checkPlantWeighings(plantsFile.text, planted, name, today) : undefined), [plantsFile, planted, name, today]);
  const photos = useMemo<FileCheck | undefined>(() => (photoNames.length ? checkPhotos(photoNames, planted) : undefined), [photoNames, planted]);

  const findings = useMemo(
    () => checkRoom({ name, area, plantingDate, climate, plants, photos }, today),
    [name, area, plantingDate, climate, plants, photos, today],
  );
  const ready = isReady(findings);
  const show = (k: FieldKey) => submitted || !!touched[k];
  const touch = (k: FieldKey) => setTouched((t) => ({ ...t, [k]: true }));

  async function pickCsv(e: ChangeEvent<HTMLInputElement>, set: (f: PickedFile | null) => void, key: FieldKey) {
    const file = e.target.files?.[0];
    touch(key);
    if (!file) return set(null);
    set({ name: file.name, text: await readText(file) });
  }

  function pickPhotos(e: ChangeEvent<HTMLInputElement>) {
    touch("photos");
    setPhotoNames(Array.from(e.target.files ?? []).map((f) => f.name));
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (!ready) {
      // Move focus to the first field that needs fixing.
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus());
      return;
    }
    const files: DraftFile[] = [];
    const add = (kind: DraftFile["kind"], label: string, fileName: string, c?: FileCheck) =>
      c && files.push({ kind, label, fileName, ok: c.ok, passed: c.passed, warnings: c.findings.filter((f) => f.level === "warning").length });
    add("climate", "Climate log", climateFile?.name ?? "", climate);
    add("plants", "Plant weighings", plantsFile?.name ?? "", plants);
    add("photos", "Noon photos", "", photos); // the range line already says how many
    const draft: RoomDraft = {
      draft: true,
      name: name.trim(),
      areaM2: Number(area.replace(",", ".")),
      plantingDate: planted!,
      files,
      savedAt: new Date().toISOString(),
    };
    setStorageOk(saveDraft(draft));
    setSaved(draft);
  }

  function editDraft() {
    if (saved) {
      setName(saved.name);
      setArea(String(saved.areaM2));
      setPlantingDate(saved.plantingDate);
    }
    setClimateFile(null);
    setPlantsFile(null);
    setPhotoNames([]);
    setTouched({});
    setSubmitted(false);
    setSaved(null);
  }

  function removeDraft() {
    clearDraft();
    setName("");
    setArea("");
    setPlantingDate("");
    setClimateFile(null);
    setPlantsFile(null);
    setPhotoNames([]);
    setTouched({});
    setSubmitted(false);
    setSaved(null);
  }

  return (
    <main className="ar">
      <header className="ar-head">
        <p className="ar-micro">My greenhouses</p>
        <h1 className="ar-title">Add a room</h1>
        <p className="ar-lede">
          Tell us about a new room and add its data files. We check the files here, in your browser, against what our forecast needs.{" "}
          <strong>Nothing is uploaded.</strong>
        </p>
      </header>

      {saved ? (
        <Summary draft={saved} today={today} storageOk={storageOk} onEdit={editDraft} onRemove={removeDraft} />
      ) : (
        <div className="ar-layout">
          <form ref={formRef} className="ar-card" onSubmit={onSubmit} noValidate aria-label="Add a room">
            <fieldset className="ar-section">
              <legend className="ar-section-title">About the room</legend>
              <TextField
                label="Room name"
                value={name}
                onChange={setName}
                onBlur={() => touch("name")}
                findings={show("name") ? findings.name : []}
                autoComplete="off"
                placeholder="e.g. North 2"
              />
              <TextField
                label="Growing area (m²)"
                value={area}
                onChange={setArea}
                onBlur={() => touch("area")}
                findings={show("area") ? findings.area : []}
                inputMode="decimal"
                placeholder="e.g. 96"
              />
              <TextField
                label="Planting date"
                required
                type="date"
                max={today}
                value={plantingDate}
                onChange={setPlantingDate}
                onBlur={() => touch("plantingDate")}
                findings={show("plantingDate") ? findings.plantingDate : []}
                hint="Warmth, days grown and costs all count from this day."
                extra={planted && daysBetween(planted, today) >= 0 ? <>Day {daysBetween(planted, today)} today</> : null}
              />
            </fieldset>

            <fieldset className="ar-section">
              <legend className="ar-section-title">Data files</legend>
              <FileField
                label="Climate log"
                required
                accept=".csv,text/csv"
                hint="CSV with timestamp and air_temp_c (°C), every 5 min to hourly, from planting day."
                fileLabel={climateFile?.name}
                check={climate}
                findings={show("climate") ? findings.climate : []}
                onChange={(e) => pickCsv(e, setClimateFile, "climate")}
              />
              <FileField
                label="Plant weighings"
                required
                accept=".csv,text/csv"
                hint="CSV with date, fruit_weight_g and red_fruit_weight_g (or pct_red), one row per plant."
                fileLabel={plantsFile?.name}
                check={plants}
                findings={show("plants") ? findings.plants : []}
                onChange={(e) => pickCsv(e, setPlantsFile, "plants")}
              />
              <FileField
                label="Noon photos"
                accept="image/jpeg,image/png"
                multiple
                hint="Optional. Named like north2_20270315_1200.jpg. Only the names are checked."
                fileLabel={photoNames.length ? `${photoNames.length} photo${photoNames.length === 1 ? "" : "s"}` : undefined}
                check={photos}
                findings={show("photos") ? findings.photos : []}
                onChange={pickPhotos}
              />
            </fieldset>

            <div className="ar-actions">
              <button type="submit" className="ar-btn">Check and save draft</button>
              {submitted && !ready ? (
                <p className="ar-actions-note" role="alert">Some fields need fixing; see the notes in red.</p>
              ) : (
                <p className="ar-actions-note">Saved in this browser only.</p>
              )}
            </div>
          </form>

          <aside className="ar-aside" aria-label="What the files need">
            <h2 className="ar-section-title">What the files need</h2>
            <dl className="ar-needs">
              <dt>Climate log</dt>
              <dd>
                A <code>timestamp</code> (ISO date and time) and <code>air_temp_c</code> in °C. One file per room, or a <code>room</code> column. Rows oldest first, no gap longer than a day.
              </dd>
              <dt>Plant weighings</dt>
              <dd>
                <code>date</code>, <code>fruit_weight_g</code> and <code>red_fruit_weight_g</code> (or <code>pct_red</code>) per plant, in grams. At least one weighing once fruit starts turning red.
              </dd>
              <dt>Noon photos</dt>
              <dd>Optional. A fixed camera looking down, around noon; photos under purple grow lamps aren't used for colour.</dd>
              <dt>Planting date</dt>
              <dd>Required. It can't be in the future, and the climate log has to start on or after it.</dd>
            </dl>
            <p className="ar-caption">Full list: “What a grower sends us” (docs/input-contract.md).</p>
          </aside>
        </div>
      )}
    </main>
  );
}

// ---------------------------------------------------------------- pieces

/** Findings under a field: errors flagged "!" in loss red, warnings in amber. */
function FindingList({ id, findings }: { id: string; findings: Finding[] }) {
  if (!findings.length) return null;
  return (
    <ul className="ar-findings" id={id}>
      {findings.map((f, i) => (
        <li key={i} className={`ar-finding ar-finding--${f.level}`}>
          <span className="ar-mark" aria-hidden="true">!</span>
          <span>
            <span className="ar-sr">{f.level === "error" ? "Fix: " : "Check: "}</span>
            {f.message}
          </span>
        </li>
      ))}
    </ul>
  );
}

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  findings: Finding[];
  required?: boolean;
  type?: string;
  max?: string;
  hint?: string;
  extra?: ReactNode;
  placeholder?: string;
  inputMode?: "decimal" | "text";
  autoComplete?: string;
}

function TextField({ label, value, onChange, onBlur, findings, required = true, type = "text", max, hint, extra, placeholder, inputMode, autoComplete }: TextFieldProps) {
  const id = useId();
  const hasError = findings.some((f) => f.level === "error");
  const describedBy = [hint ? `${id}-hint` : "", findings.length ? `${id}-f` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className="ar-field">
      <label htmlFor={id} className="ar-label">
        {label} {required && <span className="ar-req">required</span>}
      </label>
      {hint && <p className="ar-hint" id={`${id}-hint`}>{hint}</p>}
      <div className="ar-input-row">
        <input
          id={id}
          className="ar-input"
          type={type}
          value={value}
          max={max}
          placeholder={placeholder}
          inputMode={inputMode}
          autoComplete={autoComplete}
          aria-required={required}
          aria-invalid={hasError}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
        />
        {extra && <span className="ar-extra">{extra}</span>}
      </div>
      <FindingList id={`${id}-f`} findings={findings} />
    </div>
  );
}

interface FileFieldProps {
  label: string;
  required?: boolean;
  accept: string;
  multiple?: boolean;
  hint: string;
  fileLabel?: string;
  check?: FileCheck;
  findings: Finding[];
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
}

function FileField({ label, required = false, accept, multiple, hint, fileLabel, check, findings, onChange }: FileFieldProps) {
  const id = useId();
  const hasError = findings.some((f) => f.level === "error");
  const state = !check ? "empty" : check.ok ? (check.findings.length ? "warn" : "ok") : "bad";
  const stateWord = { empty: "", ok: "Looks good", warn: "OK, with notes", bad: "Needs fixing" }[state];
  return (
    <div className={`ar-field ar-file ar-file--${state}`}>
      <label htmlFor={id} className="ar-label">
        {label} {required ? <span className="ar-req">required</span> : <span className="ar-opt">optional</span>}
      </label>
      <p className="ar-hint" id={`${id}-hint`}>{hint}</p>
      <div className="ar-file-row">
        <input
          id={id}
          className="ar-file-input"
          type="file"
          accept={accept}
          multiple={multiple}
          aria-required={required}
          aria-invalid={hasError}
          aria-describedby={`${id}-hint ${id}-status`}
          onChange={onChange}
        />
        <label htmlFor={id} className="ar-file-btn">{fileLabel ? "Choose another" : multiple ? "Choose files" : "Choose file"}</label>
        <span className="ar-file-name">{fileLabel ?? "No file chosen"}</span>
      </div>
      <div id={`${id}-status`} aria-live="polite">
        {check && (
          <div className="ar-check">
            <p className={`ar-check-state ar-check-state--${state}`}>{stateWord}</p>
            {check.passed.length > 0 && (
              <ul className="ar-passed">
                {check.passed.map((p, i) => (
                  <li key={i}>
                    <span className="ar-tick" aria-hidden="true">✓</span>
                    {p}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <FindingList id={`${id}-f`} findings={findings} />
      </div>
    </div>
  );
}

/** The "412 rows, 3 Sep – 19 Oct" style line from a file's passed checks, if any. */
function rangeLine(f: DraftFile): string | undefined {
  return f.passed.find((p) => /^\d+ (rows|plants weighed|photos over)/.test(p));
}

/** "North" -> "Room North"; a name that already starts with "room" is left as typed. */
export function roomLabel(name: string): string {
  return /^room\b/i.test(name) ? name : `Room ${name}`;
}

/** After submit: a crate-tag style summary of the draft and what happens next. */
function Summary({ draft, today, storageOk, onEdit, onRemove }: { draft: RoomDraft; today: string; storageOk: boolean; onEdit: () => void; onRemove: () => void }) {
  const okCount = draft.files.filter((f) => f.ok).length;
  const day = daysBetween(draft.plantingDate, today);
  return (
    <section className="ar-summary" aria-labelledby="ar-summary-title">
      <article className="ar-tag">
        <span className="ar-tag-hole" aria-hidden="true" />
        <div className="ar-tag-block">
          <p className="ar-micro">New room · draft</p>
          <h2 className="ar-tag-name" id="ar-summary-title">{draft.name}</h2>
          <p className="ar-tag-line" data-testid="summary-line">
            {roomLabel(draft.name)} · planted {formatDate(draft.plantingDate)} · {okCount} file{okCount === 1 ? "" : "s"} OK
          </p>
        </div>
        <div className="ar-tag-block ar-tag-facts">
          <div>
            <p className="ar-micro">Area</p>
            <p className="ar-num">{draft.areaM2} m²</p>
          </div>
          <div>
            <p className="ar-micro">Days grown</p>
            <p className="ar-num">{day >= 0 ? `Day ${day}` : "—"}</p>
          </div>
          <span className="ar-stamp">Draft</span>
        </div>
        <ul className="ar-tag-block ar-passed">
          {draft.files.map((f) => (
            <li key={f.kind}>
              <span className="ar-tick" aria-hidden="true">✓</span>
              <strong>{f.label}</strong>
              {f.fileName ? ` · ${f.fileName}` : ""}
              {rangeLine(f) ? ` · ${rangeLine(f)}` : ""}
              {f.warnings ? ` · ${f.warnings} note${f.warnings === 1 ? "" : "s"}` : ""}
            </li>
          ))}
        </ul>
      </article>

      <div className="ar-next">
        <h2 className="ar-section-title">What happens next</h2>
        <p>
          <strong>The forecast for this room is made by our team’s pipeline, not in this browser.</strong> Nothing has been sent anywhere. Send the
          same files to the team; the room appears on My greenhouses with its harvest window and how sure we are after the next pipeline run.
        </p>
        <p className="ar-caption">
          {storageOk
            ? "This draft is saved in this browser only. Clearing your browser data removes it."
            : "Your browser blocked saving, so this draft disappears when you leave the page."}
        </p>
        <div className="ar-actions">
          <button type="button" className="ar-btn ar-btn--quiet" onClick={onEdit}>Edit room</button>
          <button type="button" className="ar-link" onClick={onRemove}>Remove draft</button>
        </div>
        <p className="ar-caption">Editing keeps the name, area and planting date; add the files again to re-check them.</p>
      </div>
    </section>
  );
}
