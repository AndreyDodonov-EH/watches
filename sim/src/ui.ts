// Minimal control panel generated from PARAM_META. No framework.
import { DEFAULT_PARAMS, PARAM_META, PRESET_CONCEPT, PRESET_MINT, PRESET_NEON, PRESET_USER_V1, type Params } from './params';

export interface UiHooks { onChange: () => void; }

export function buildPanel(root: HTMLElement, p: Params, hooks: UiHooks): { refresh: () => void } {
  const inputs = new Map<string, HTMLInputElement>();
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
    const name = document.createElement('span'); name.textContent = meta.label ?? key; name.title = key; row.appendChild(name);
    const v = p[key];
    const inp = document.createElement('input');
    const val = document.createElement('output');
    if (typeof v === 'boolean') {
      inp.type = 'checkbox'; inp.checked = v;
      inp.oninput = () => { (p as any)[key] = inp.checked; hooks.onChange(); };
    } else if (typeof v === 'string') {
      inp.type = 'color'; inp.value = v;
      inp.oninput = () => { (p as any)[key] = inp.value; val.textContent = inp.value; hooks.onChange(); };
      val.textContent = v;
    } else {
      inp.type = 'range'; inp.min = String(meta.min ?? 0); inp.max = String(meta.max ?? 100); inp.step = String(meta.step ?? 1);
      inp.value = String(v); val.textContent = String(v);
      inp.oninput = () => { (p as any)[key] = parseFloat(inp.value); val.textContent = inp.value; hooks.onChange(); };
    }
    row.appendChild(inp); row.appendChild(val);
    grp(meta.group).appendChild(row);
    inputs.set(key, inp);
  }
  const refresh = () => {
    for (const [k, inp] of inputs) {
      const v = (p as any)[k];
      if (inp.type === 'checkbox') inp.checked = v; else inp.value = String(v);
      const out = inp.nextElementSibling as HTMLOutputElement | null;
      if (out) out.textContent = inp.type === 'checkbox' ? '' : String(v);
    }
  };

  // presets + import/export
  const bar = document.createElement('div'); bar.className = 'bar';
  const btn = (t: string, f: () => void) => { const b = document.createElement('button'); b.textContent = t; b.onclick = f; bar.appendChild(b); };
  const apply = (src: Partial<Params>) => { Object.assign(p, src); refresh(); hooks.onChange(); };
  btn('User v1', () => apply(PRESET_USER_V1));
  btn('Mint (spec)', () => apply(PRESET_MINT));
  btn('Neon (ref photo)', () => apply(PRESET_NEON));
  btn('Concept art', () => apply(PRESET_CONCEPT));
  btn('Reset all', () => apply(structuredClone(DEFAULT_PARAMS)));
  btn('Export JSON', () => {
    const blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'params.json'; a.click();
  });
  btn('Copy JSON', () => { navigator.clipboard.writeText(JSON.stringify(p, null, 2)); });
  const file = document.createElement('input'); file.type = 'file'; file.accept = '.json'; file.style.display = 'none';
  file.onchange = async () => { const f = file.files?.[0]; if (!f) return; apply(JSON.parse(await f.text())); };
  btn('Import JSON', () => file.click());
  bar.appendChild(file);
  root.prepend(bar);
  return { refresh };
}
