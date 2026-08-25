// Session persistence. Everything you touch in the sim — params AND view state (zoom, cuff/gloss,
// time mode, tilt) — is written to localStorage on every edit, debounced. Exporting JSON is therefore
// only for checkpointing a finished look into the repo (`sim/params.json`), never to avoid losing work.
//
// `?fresh=1` starts from the code defaults *without* clearing the store: that is how you see changed
// DEFAULT_PARAMS, since a stored value always wins over a new default for a key that already existed.
import { DEFAULT_PARAMS, migrateParams, type Params } from './params';
import { DEFAULT_OVERLAY, type OverlayOpts } from './overlay';

const KEY = 'liquid-watch-session-v1';
const LEGACY_PARAMS = 'liquid-watch-params-v2'; // params-only store used before the session blob

/** Everything outside `Params`: presentation and playback, none of it ported to firmware. */
export interface ViewState {
  scale: number;
  showGrid: boolean;
  paused: boolean;
  timeMode: 'real' | 'demo' | 'set';
  demoSpeed: number;
  setClock: { h: number; m: number };
  manual: { along: number; across: number };
  overlay: OverlayOpts;
}
export const DEFAULT_VIEW: ViewState = {
  scale: 0.5, showGrid: false, paused: false, timeMode: 'real', demoSpeed: 60,
  setClock: { h: 10, m: 9 }, manual: { along: 0, across: 0 }, overlay: { ...DEFAULT_OVERLAY },
};
export interface Session { params: Params; view: ViewState }

function read(key: string): Record<string, unknown> | null {
  try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch { return null; }
}

/** code defaults ← stored session (or the legacy params-only key). Keys added to the schema since the
 *  store was written fall back to their code default; keys removed from it are dropped by migrateParams. */
export function loadSession(fresh = false): Session {
  const params: Params = { ...DEFAULT_PARAMS };
  const view: ViewState = { ...DEFAULT_VIEW, overlay: { ...DEFAULT_OVERLAY }, setClock: { ...DEFAULT_VIEW.setClock }, manual: { ...DEFAULT_VIEW.manual } };
  if (fresh) return { params, view };
  const stored = read(KEY);
  const v = stored?.view as Partial<ViewState> | undefined;
  const storedParams = (stored?.params as Record<string, unknown> | undefined) ?? read(LEGACY_PARAMS);
  if (storedParams) Object.assign(params, migrateParams(storedParams));
  const legacyOverlay = v?.overlay as (Partial<OverlayOpts> & { lens?: number; lensCurve?: number }) | undefined;
  if ((!storedParams || !('lens' in storedParams)) && typeof legacyOverlay?.lens === 'number') params.lens = legacyOverlay.lens;
  if ((!storedParams || !('lensCurve' in storedParams)) && typeof legacyOverlay?.lensCurve === 'number') params.lensCurve = legacyOverlay.lensCurve;
  if (v) {
    Object.assign(view, v);
    view.overlay = { ...DEFAULT_OVERLAY, ...v.overlay };
    delete (view.overlay as any).lens;
    delete (view.overlay as any).lensCurve;
    view.setClock = { ...DEFAULT_VIEW.setClock, ...v.setClock };
    view.manual = { ...DEFAULT_VIEW.manual, ...v.manual };
  }
  return { params, view };
}

let pending: Session | null = null;
let timer = 0;
function flush(): void {
  timer = 0;
  if (!pending) return;
  // `pending` holds the live objects, so this serialises the newest state, not the state at call time.
  try { localStorage.setItem(KEY, JSON.stringify(pending)); localStorage.removeItem(LEGACY_PARAMS); }
  catch { /* quota exceeded / private mode: keep the sim running, just unsaved */ }
  pending = null;
}
/** Debounced: dragging a slider fires `input` per pixel, one write per 250 ms is plenty. */
export function saveSession(s: Session): void {
  pending = s;
  if (!timer) timer = window.setTimeout(flush, 250);
}
/** Write immediately — used when the tab goes away mid-debounce. */
export function flushSession(): void {
  if (timer) { clearTimeout(timer); timer = 0; }
  flush();
}
addEventListener('pagehide', flushSession);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSession(); });
