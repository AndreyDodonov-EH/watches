// "Material" group of the params panel: physical-material mode. The liquid is authored from the physical
// properties (MATERIAL_META) plus the allowlisted design keys; the legacy Params are derive(material,
// design), applied in place (the physics loop, the device push and the legacy panel hold that object).
// A rejected material leaves the last valid Params untouched and says why.
import type { Params } from '../params';
import type { MaterialState } from '../persist';
import { coherenceIssues } from './coherence';
import { deriveReport, DERIVED_KEYS, FIXED_KEYS, type DeriveReport } from './derive';
import {
  DESIGN_KEYS, MATERIAL_META, parseMaterialEnvelope, serializeMaterialEnvelope, validateMaterial,
  type Design, type DesignKey, type Material, type MaterialFieldMeta, type MaterialProvenance,
} from './model';
import { MATERIAL_PRESETS, type MaterialPreset } from './presets';

/** Legacy keys the material owns: their legacy inputs are read-only in material mode. */
export const LOCKED_KEYS: ReadonlySet<string> = new Set<string>([...DERIVED_KEYS, ...FIXED_KEYS]);
export const isDesignKey = (key: string): key is DesignKey => (DESIGN_KEYS as readonly string[]).includes(key);

export interface MaterialHooks {
  /** The live legacy Params; derive results are assigned into it (identity kept). */
  readonly params: Params;
  /** Params were replaced by a derive. `changed` = keys whose value changed; `whole` = a whole-state
   *  change (mode entry, preset, import, load) rather than one field edit. */
  onDerived: (changed: (keyof Params)[], whole: boolean) => void;
  /** The mode changed (lock / unlock the legacy panel). */
  onMode: (mode: MaterialState['mode']) => void;
  /** State changed without a successful derive (persist it). */
  save: () => void;
}

export interface MaterialPanel {
  /** Sync every control (mode, preset, fields, readout) from the state. */
  refresh: () => void;
  /** Enter material mode: the design is taken from the current Params' DESIGN_KEYS. No derive. */
  enter: () => void;
  /** Leave material mode: Params stay as they are. */
  leave: () => void;
  /** Load a material preset and enter material mode. The dropdown brings the LIQUID only (the design —
   *  backing, marks, layout, slug — stays the user's, adopted from the current Params when entering);
   *  `withDesign` also takes the preset's own design (the `?material=` URL: a complete look). No derive. */
  selectPreset: (id: string, withDesign?: boolean) => boolean;
  /** Take the design from the current Params (a legacy whole-struct change in material mode). No derive. */
  adoptDesign: () => void;
  /** derive(state) → Params. Returns false (Params untouched) on rejection. */
  rederive: (whole: boolean) => boolean;
}

const N = 1000; // log-slider positions
const LOG_ZERO_SPAN = 1e-5; // a log field with min 0: position 1 is max·1e-5, position 0 is exactly 0

function logLo(m: MaterialFieldMeta): number { return m.min > 0 ? m.min : m.max * LOG_ZERO_SPAN; }
function toPos(m: MaterialFieldMeta, v: number): number {
  const lo = logLo(m);
  if (m.min <= 0) {
    if (v <= 0) return 0;
    if (v <= lo) return 1;
    return 1 + Math.round((N - 1) * Math.log(v / lo) / Math.log(m.max / lo));
  }
  return Math.round(N * Math.log(Math.max(v, lo) / lo) / Math.log(m.max / lo));
}
function fromPos(m: MaterialFieldMeta, pos: number): number {
  const lo = logLo(m);
  let v: number;
  if (m.min <= 0) v = pos <= 0 ? 0 : lo * (m.max / lo) ** ((pos - 1) / (N - 1));
  else v = lo * (m.max / lo) ** (pos / N);
  return Math.min(m.max, Math.max(m.min, +v.toPrecision(3)));
}

function sameMaterial(a: Material, b: Material): boolean {
  return MATERIAL_META.every((m) => a[m.key] === b[m.key]);
}

// fixed-width number formats for the readout (never reflow the panel)
const fx = (v: number, d: number, w: number): string => (Number.isFinite(v) ? v.toFixed(d) : '—').padStart(w);
const fe = (v: number): string => (Number.isFinite(v) ? v.toExponential(2) : '—').padStart(8);

export function buildMaterialPanel(root: HTMLElement, state: MaterialState, hooks: MaterialHooks): MaterialPanel {
  const { params } = hooks;
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] => {
    const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e;
  };

  const box = el('details', 'material'); box.open = true; box.id = 'material';
  box.appendChild(el('summary', '', 'Material'));

  // mode + preset
  const head = el('div', 'mhead');
  const modeLabel = el('label', 'mmode');
  const mode = el('input'); mode.type = 'checkbox'; mode.id = 'mat-mode';
  modeLabel.append(mode, document.createTextNode(' physical material'));
  const presetSel = el('select', 'presets'); presetSel.id = 'mat-preset';
  presetSel.add(new Option('custom material', ''));
  for (const e of MATERIAL_PRESETS) { const o = new Option(e.name, e.id); o.title = e.note; presetSel.add(o); }
  const presetDesignBtn = el('button', '', "preset's design"); presetDesignBtn.id = 'mat-preset-design';
  presetDesignBtn.title = "Also take this preset's backing, marks, layout and slug settings (the dropdown alone changes the liquid only)";
  presetDesignBtn.onclick = () => presetDesign();
  head.append(modeLabel, presetSel, presetDesignBtn);
  box.appendChild(head);

  // status + derived readout
  const status = el('div', 'mstatus'); status.id = 'mat-status';
  const readout = el('pre', 'mono mreadout'); readout.id = 'mat-derived';

  // physical fields, grouped by MATERIAL_META.group in first-appearance order
  interface Field { meta: MaterialFieldMeta; ctl: HTMLInputElement | HTMLSelectElement; num?: HTMLInputElement }
  const fields: Field[] = [];
  const groups = new Map<string, HTMLDetailsElement>();
  const fieldsBox = el('div', 'mfields');
  for (const meta of MATERIAL_META) {
    let g = groups.get(meta.group);
    if (!g) { g = el('details', 'msub'); g.open = true; g.appendChild(el('summary', '', meta.group)); fieldsBox.appendChild(g); groups.set(meta.group, g); }
    const row = el('label', 'mrow'); row.dataset.key = meta.key;
    const name = el('span', '', meta.label);
    name.title = `${meta.label}${meta.unit ? ` [${meta.unit}]` : ''} · ${meta.key}\n${meta.help}`;
    const unit = el('output', '', meta.unit);
    if (meta.options) {
      const sel = el('select'); sel.id = `mat-${meta.key}`;
      meta.options.forEach((text, i) => sel.add(new Option(`${meta.min + i} · ${text}`, String(meta.min + i))));
      sel.oninput = () => edit(meta, parseInt(sel.value, 10));
      row.append(name, sel, unit);
      fields.push({ meta, ctl: sel });
    } else {
      const range = el('input'); range.type = 'range'; range.id = `mat-${meta.key}`;
      if (meta.log) { range.min = '0'; range.max = String(N); range.step = '1'; }
      else { range.min = String(meta.min); range.max = String(meta.max); range.step = String(meta.integer ? Math.max(1, meta.step) : meta.step); }
      const num = el('input'); num.type = 'number'; num.id = `mat-${meta.key}-n`;
      num.step = meta.log ? 'any' : String(meta.step);
      range.oninput = () => {
        const v = meta.log ? fromPos(meta, +range.value) : +range.value;
        num.value = String(v); num.classList.remove('bad');
        edit(meta, v);
      };
      num.onchange = () => {
        const v = parseFloat(num.value);
        const bad = !Number.isFinite(v) ? 'not a number' : v < meta.min || v > meta.max ? `outside [${meta.min}, ${meta.max}]`
          : meta.integer && !Number.isInteger(v) ? 'must be an integer' : '';
        num.classList.toggle('bad', !!bad);
        if (bad) { setStatus('err', `${meta.label}: ${num.value || '(empty)'} ${bad} — not applied`); return; }
        range.value = String(meta.log ? toPos(meta, v) : v);
        edit(meta, v);
      };
      row.append(name, range, num, unit);
      fields.push({ meta, ctl: range, num });
    }
    g.appendChild(row);
  }

  // actions
  const bar = el('div', 'bar mbar');
  const button = (id: string, text: string, f: () => void): HTMLButtonElement => {
    const b = el('button', '', text); b.id = id; b.onclick = f; bar.appendChild(b); return b;
  };
  const file = el('input'); file.type = 'file'; file.accept = '.json,application/json'; file.id = 'mat-import-file'; file.style.display = 'none';
  button('mat-export', 'export material', () => {
    try {
      // the state's own metadata (a preset's or an imported file's); a stored state from before it was
      // kept falls back to the matching built-in preset's
      const p = matchedMaterial(), name = state.name ?? p?.name, provenance = state.provenance ?? p?.provenance;
      const text = serializeMaterialEnvelope({
        material: state.material, design: state.design, ...(name !== undefined ? { name } : {}), ...(provenance ? { provenance } : {}),
      });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      a.download = `${p?.id ?? 'material'}.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (error) { setStatus('err', `export failed: ${(error as Error).message}`); }
  });
  button('mat-import', 'import material', () => file.click());
  file.onchange = async () => {
    const f = file.files?.[0]; file.value = '';
    if (!f) return;
    try {
      const env = parseMaterialEnvelope(await f.text());
      toMaterialMode();
      state.material = { ...env.material }; state.design = { ...env.design };
      setMeta(env.name, env.provenance);
      refresh();
      rederive(true);
    } catch (error) { setStatus('err', `import rejected: ${(error as Error).message}`); }
  };
  button('mat-copy', 'copy derived legacy JSON', () => {
    const text = JSON.stringify(params);
    navigator.clipboard.writeText(text).then(() => setStatus('ok', `copied derived Params (${text.length} chars)`),
      (error) => setStatus('err', `clipboard: ${String(error)}`));
  });
  bar.appendChild(file);

  box.append(status, readout, bar, fieldsBox);
  root.prepend(box);

  // ---- behaviour ----
  let lastGood: Params = structuredClone(params);
  let report: DeriveReport | null = null;

  function setStatus(kind: 'ok' | 'warn' | 'err' | 'idle', text: string): void {
    status.className = `mstatus ${kind}`; status.textContent = text; status.title = text;
  }
  /** The envelope metadata of the material now in the state (absent fields removed, not left undefined). */
  function setMeta(name: string | undefined, provenance: MaterialProvenance | undefined): void {
    if (name !== undefined) state.name = name; else delete state.name;
    if (provenance) state.provenance = { ...provenance }; else delete state.provenance;
  }
  /** The preset whose liquid the state holds, whatever the design: the dropdown, the export filename and the
   *  metadata fallback (provenance is per material property, so it holds on any design). */
  function matchedMaterial(): MaterialPreset | undefined {
    return MATERIAL_PRESETS.find((e) => sameMaterial(e.material, state.material));
  }
  function showReadout(): void {
    if (state.mode !== 'material' || !report) {
      readout.textContent = ['viscosity —        opacity —', 'emissive  —        wetting —      gas —', 'T      —  Tlum     —  Tmax     —  lc     —', 'μ_eff        —  Oh        —  Ca₀        —'].join('\n');
      return;
    }
    const { classes: c, coords: k } = report;
    readout.textContent = [
      `viscosity ${c.viscosity.padEnd(8)} opacity ${c.opacity}`,
      `emissive  ${(c.emissive ? 'yes' : 'no').padEnd(8)} wetting ${(c.wetting ? 'yes' : 'no').padEnd(6)} gas ${c.gas}`,
      `T ${fx(k.T, 3, 6)}  Tlum ${fx(k.Tlum, 3, 5)}  Tmax ${fx(k.Tmax, 3, 5)}  lc ${fx(k.lc, 2, 5)}`,
      `μ_eff ${fe(k.muEff)}  Oh ${fe(k.Oh)}  Ca₀ ${fe(k.Ca0)}`,
    ].join('\n');
  }
  function refresh(): void {
    const on = state.mode === 'material';
    mode.checked = on;
    presetSel.value = matchedMaterial()?.id ?? '';
    for (const f of fields) {
      const v = state.material[f.meta.key];
      f.ctl.disabled = !on;
      if (f.ctl instanceof HTMLSelectElement) f.ctl.value = String(v);
      else f.ctl.value = String(f.meta.log ? toPos(f.meta, v) : v);
      if (f.num) { f.num.disabled = !on; f.num.value = String(v); f.num.classList.remove('bad'); }
    }
    box.classList.toggle('on', on);
    if (!on) setStatus('idle', 'legacy mode: the Params below are edited directly');
    showReadout();
  }

  function edit(meta: MaterialFieldMeta, v: number): void {
    const next = { ...state.material, [meta.key]: v };
    try { validateMaterial(next); } catch (error) { setStatus('err', (error as Error).message); return; }
    state.material = next;
    presetSel.value = matchedMaterial()?.id ?? '';
    rederive(false);
  }

  function rederive(whole: boolean): boolean {
    let r: DeriveReport;
    try { r = deriveReport(state.material, state.design); }
    catch (error) { setStatus('err', `derive failed: ${(error as Error).message}`); hooks.save(); return false; }
    report = r;
    showReadout();
    if (r.issues.length) {
      // no partial apply: the last accepted Params stay (a design edit already wrote its key: undo it)
      Object.assign(params, lastGood);
      setStatus('err', `rejected — Params unchanged:\n- ${r.issues.join('\n- ')}`);
      hooks.save();
      return false;
    }
    // against the previous accepted Params: a design edit has already written its key into `params`
    const changed = (Object.keys(r.params) as (keyof Params)[]).filter((k) => lastGood[k] !== r.params[k]);
    Object.assign(params, r.params);
    lastGood = structuredClone(params);
    const coh = coherenceIssues(params, r.classes);
    if (coh.length) setStatus('warn', `derived, but incoherent for its class:\n- ${coh.join('\n- ')}`);
    else setStatus('ok', `derived ${r.classes.viscosity} / ${r.classes.opacity}${r.classes.emissive ? ' / emissive' : ''} · coherent`);
    hooks.onDerived(changed, whole);
    return true;
  }

  function adoptDesign(): void {
    const d: Record<string, unknown> = {};
    for (const k of DESIGN_KEYS) d[k] = params[k];
    state.design = d as Design;
  }
  function enter(): void {
    lastGood = structuredClone(params);
    adoptDesign();
    state.mode = 'material';
    hooks.onMode('material');
    refresh();
  }
  function leave(): void {
    state.mode = 'legacy';
    hooks.onMode('legacy');
    refresh();
    hooks.save();
  }
  /** Switch to material mode keeping the state's material and design (a preset or import replaces both). */
  function toMaterialMode(): void {
    if (state.mode === 'material') return;
    lastGood = structuredClone(params);
    state.mode = 'material';
    hooks.onMode('material');
  }
  function selectPreset(id: string, withDesign = false): boolean {
    const e = MATERIAL_PRESETS.find((x) => x.id === id);
    if (!e) return false;
    if (state.mode !== 'material') { lastGood = structuredClone(params); adoptDesign(); state.mode = 'material'; hooks.onMode('material'); }
    state.material = { ...e.material };
    if (withDesign) state.design = { ...e.design };
    setMeta(e.name, e.provenance);
    refresh();
    return true;
  }
  /** Take the selected preset's own design (backing, marks, layout, slug) on top of its liquid. */
  function presetDesign(): void {
    const e = MATERIAL_PRESETS.find((x) => x.id === presetSel.value);
    if (!e || state.mode !== 'material') return;
    state.design = { ...e.design };
    refresh(); rederive(true);
  }

  mode.oninput = () => {
    if (mode.checked) { enter(); rederive(true); } else leave();
  };
  presetSel.oninput = () => {
    if (!presetSel.value) { refresh(); return; }
    if (selectPreset(presetSel.value)) rederive(true);
  };

  refresh();
  return {
    refresh, enter, leave, selectPreset, rederive,
    adoptDesign: () => { adoptDesign(); refresh(); },
  };
}
