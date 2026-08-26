// Minimal control panel generated from PARAM_META. No framework.
import { DEFAULT_PARAMS, PARAM_META, PRESETS, migrateParams, presetParams, type Params, type PresetEntry } from './params';

/** `key` is set for a single-field edit; absent for preset/import/reset (whole struct changed). */
export interface UiHooks { onChange: (key?: keyof Params) => void; }

export function buildPanel(root: HTMLElement, p: Params, hooks: UiHooks): { refresh: () => void } {
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
    const row = document.createElement('label'); row.className = 'row';
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
  sel.oninput = () => { const e = PRESETS.find((x) => x.id === sel.value); if (e) apply(presetParams(e)); };
  bar.appendChild(sel);
  btn('Reset all', () => apply(structuredClone(DEFAULT_PARAMS)));
  btn('Export JSON', () => {
    const blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'params.json'; a.click();
  });
  btn('Copy JSON', () => { navigator.clipboard.writeText(JSON.stringify(p, null, 2)); });
  const file = document.createElement('input'); file.type = 'file'; file.accept = '.json'; file.style.display = 'none';
  file.onchange = async () => { const f = file.files?.[0]; if (!f) return; apply(migrateParams(JSON.parse(await f.text()))); };
  btn('Import JSON', () => file.click());
  bar.appendChild(file);
  root.prepend(bar);
  return { refresh };
}
