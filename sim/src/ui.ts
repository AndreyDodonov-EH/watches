// Minimal control panel generated from PARAM_META. No framework.
import { DEFAULT_PARAMS, GAS_MODELS, GAS_KEYS, PARAM_META, PRESETS, gasParams, migrateParams, presetParams, type Params, type PresetEntry } from './params';

/** `key` is set for a single-field edit; absent for preset/import/reset (whole struct changed). */
export interface UiHooks { onChange: (key?: keyof Params) => void; }

export interface Panel {
  refresh: () => void;
  /** Disable the inputs (range + numeric twin, colour, checkbox, select) of `keys`; every other key is enabled. */
  setLocked: (keys: ReadonlySet<string>) => void;
  /** Mark the rows of `keys` `flag-err` (a material problem points at them); every other row is cleared. */
  setFlagged: (keys: ReadonlySet<keyof Params>) => void;
  /** Open the row's group, scroll it into view and focus its first enabled input; false without a row. */
  reveal: (key: keyof Params) => boolean;
}

export function buildPanel(root: HTMLElement, p: Params, hooks: UiHooks): Panel {
  const inputs = new Map<string, HTMLInputElement | HTMLSelectElement>();
  const groups = new Map<string, HTMLElement>();
  const grp = (name: string): HTMLElement => {
    let g = groups.get(name);
    if (!g) {
      g = document.createElement('details'); (g as HTMLDetailsElement).open = name === 'Colour' || name === 'Shape';
      const s = document.createElement('summary'); s.textContent = name; g.appendChild(s);
      root.appendChild(g); groups.set(name, g);
    }
    return g;
  };
  for (const key of Object.keys(PARAM_META) as (keyof Params)[]) {
    const meta = PARAM_META[key];
    const row = document.createElement('label'); row.className = 'row'; row.dataset.key = key;
    const name = document.createElement('span'); name.textContent = meta.label ?? key; name.title = meta.help ? key + '\n' + meta.help : key; row.appendChild(name);
    const v = p[key];
    const inp = typeof v === 'number' && meta.options ? document.createElement('select') : document.createElement('input');
    const val = document.createElement('output');
    if (inp instanceof HTMLSelectElement) {
      meta.options!.forEach((text, value) => inp.add(new Option(`${value} · ${text}`, String(value))));
      inp.value = String(v);
      inp.oninput = () => { (p as any)[key] = parseFloat(inp.value); hooks.onChange(key); };
    } else if (typeof v === 'boolean') {
      inp.type = 'checkbox'; inp.checked = v;
      inp.oninput = () => { (p as any)[key] = inp.checked; hooks.onChange(key); };
    } else if (typeof v === 'string') {
      inp.type = 'color'; inp.value = v;
      inp.oninput = () => { (p as any)[key] = inp.value; val.textContent = inp.value; hooks.onChange(key); };
      val.textContent = v;
    } else {
      inp.type = 'range'; inp.min = String(meta.min ?? 0); inp.max = String(meta.max ?? 100); inp.step = String(meta.step ?? 1);
      inp.value = String(v);
      // typed value: same step, but not clamped to the slider range
      const num = document.createElement('input'); num.type = 'number'; num.step = inp.step; num.value = String(v);
      inp.oninput = () => { (p as any)[key] = parseFloat(inp.value); num.value = inp.value; hooks.onChange(key); };
      num.onchange = () => { const x = parseFloat(num.value); if (!Number.isFinite(x)) return; (p as any)[key] = x; inp.value = num.value; hooks.onChange(key); };
      row.appendChild(inp); row.appendChild(num); grp(meta.group).appendChild(row); inputs.set(key, inp); continue;
    }
    row.appendChild(inp); row.appendChild(val);
    grp(meta.group).appendChild(row);
    inputs.set(key, inp);
  }
  const refresh = () => {
    for (const [k, inp] of inputs) {
      const v = (p as any)[k];
      if (inp instanceof HTMLInputElement && inp.type === 'checkbox') inp.checked = v; else inp.value = String(v);
      const out = inp.nextElementSibling as HTMLElement | null;
      if (out instanceof HTMLInputElement) out.value = String(v);
      else if (out) out.textContent = inp instanceof HTMLInputElement && inp.type === 'checkbox' ? '' : String(v);
    }
  };

  // presets + import/export
  const bar = document.createElement('div'); bar.className = 'bar';
  const btn = (t: string, f: () => void) => { const b = document.createElement('button'); b.textContent = t; b.onclick = f; bar.appendChild(b); };
  const apply = (src: Partial<Params>) => { Object.assign(p, src); refresh(); hooks.onChange(); };
  const sel = document.createElement('select'); sel.className = 'presets';
  sel.add(new Option('preset…', ''));
  for (const [label, pick] of [['Signature', (e: PresetEntry) => !e.legacy && !e.big], ['Big lens', (e: PresetEntry) => !!e.big], ['Legacy', (e: PresetEntry) => !!e.legacy]] as const) {
    const g = document.createElement('optgroup'); g.label = label;
    for (const e of PRESETS) if (pick(e)) { const o = new Option(e.name, e.id); o.title = e.note; g.appendChild(o); }
    sel.appendChild(g);
  }
  // gas is picked apart from the liquid: the models that fit the selected preset (signature first), or all
  // of them when the params did not come from a preset; switching replaces only the fizz keys
  const gasSel = document.createElement('select'); gasSel.className = 'presets'; gasSel.title = 'Gas model (fizz)';
  const fillGas = (e?: PresetEntry) => {
    gasSel.replaceChildren(new Option('gas…', ''));
    for (const id of e?.gas ?? GAS_MODELS.map((g) => g.id)) {
      const g = GAS_MODELS.find((x) => x.id === id)!;
      const o = new Option(g.name, g.id); o.title = g.note; gasSel.add(o);
    }
    gasSel.value = e?.gas[0] ?? '';
  };
  fillGas();
  sel.oninput = () => { const e = PRESETS.find((x) => x.id === sel.value); if (e) { fillGas(e); apply(presetParams(e)); } };
  gasSel.oninput = () => { if (gasSel.value) apply(gasParams(gasSel.value)); };
  bar.append(sel, gasSel);
  btn('Reset all', () => { fillGas(); apply(structuredClone(DEFAULT_PARAMS)); });
  btn('Export JSON', () => {
    const blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'params.json'; a.click();
  });
  btn('Copy JSON', () => { navigator.clipboard.writeText(JSON.stringify(p, null, 2)); });
  const file = document.createElement('input'); file.type = 'file'; file.accept = '.json'; file.style.display = 'none';
  file.onchange = async () => { const f = file.files?.[0]; if (!f) return; fillGas(); apply(migrateParams(JSON.parse(await f.text()))); };
  btn('Import JSON', () => file.click());
  bar.appendChild(file);
  root.prepend(bar);
  const setLocked = (keys: ReadonlySet<string>) => {
    gasSel.disabled = GAS_KEYS.some((k) => keys.has(k));  // material mode derives the gas from the material
    for (const [k, inp] of inputs) {
      const locked = keys.has(k);
      inp.disabled = locked;
      const twin = inp.nextElementSibling;
      if (twin instanceof HTMLInputElement) twin.disabled = locked;
      inp.closest('.row')?.classList.toggle('locked', locked);
    }
  };
  const setFlagged = (keys: ReadonlySet<keyof Params>) => {
    for (const [k, inp] of inputs) inp.closest('.row')?.classList.toggle('flag-err', keys.has(k as keyof Params));
  };
  const reveal = (key: keyof Params): boolean => {
    const row = inputs.get(key)?.closest<HTMLElement>('.row');
    if (!row) return false;
    for (let e = row.parentElement; e; e = e.parentElement) if (e instanceof HTMLDetailsElement) e.open = true;
    row.scrollIntoView({ block: 'center' });
    row.querySelector<HTMLInputElement | HTMLSelectElement>('input:not(:disabled), select:not(:disabled)')?.focus({ preventScroll: true });
    return true;
  };
  return { refresh, setLocked, setFlagged, reveal };
}
