/**
 * Draft storage for the "Add a room" form. The draft lives only in this browser's
 * localStorage (never sent anywhere) and holds the typed fields plus a summary of the
 * file checks — never the file contents. Every access is wrapped in try/catch because
 * storage can be blocked (private windows, previews); the form works without it.
 */

export const DRAFT_KEY = "harvest-window.add-room.draft.v1";

export interface DraftFile {
  kind: "climate" | "plants" | "photos";
  label: string; // "Climate log"
  fileName: string; // "north.csv" or "12 photos"
  ok: boolean;
  passed: string[];
  warnings: number;
}

export interface RoomDraft {
  draft: true;
  name: string;
  areaM2: number;
  plantingDate: string; // yyyy-mm-dd
  files: DraftFile[];
  savedAt: string; // ISO timestamp
}

/** Read the saved draft, or null if none / unreadable / storage blocked. */
export function loadDraft(): RoomDraft | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as RoomDraft;
    return d && d.draft === true && typeof d.name === "string" && typeof d.plantingDate === "string" ? d : null;
  } catch {
    return null;
  }
}

/** Save the draft. Returns false when storage is unavailable, so the screen can say so. */
export function saveDraft(d: RoomDraft): boolean {
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    return true;
  } catch {
    return false;
  }
}

/** Remove the draft (ignores blocked storage). */
export function clearDraft(): void {
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* storage blocked: nothing to remove */
  }
}
