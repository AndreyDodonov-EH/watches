import type { PhysicalParams, PhysicalMeta } from './model';
import { validatePhysicalParams } from './model';

export function controls(root: HTMLElement, params: PhysicalParams, meta: readonly PhysicalMeta[], onChange: (key: keyof PhysicalParams, value: number) => void): void {
  const groups = new Map<string, HTMLElement>();
  for (const m of meta) {
    let group = groups.get(m.group);
    if (!group) { group = document.createElement('fieldset'); group.innerHTML = `<legend>${m.group}</legend>`; root.append(group); groups.set(m.group, group); }
    const label = document.createElement('label'); label.className = 'phys-control'; label.title = m.help;
    label.innerHTML = `<span>${m.label} <small>${m.unit}</small></span><output>${params[m.key]}</output><em class="field-error"></em>`;
    const input = document.createElement('input'); input.type = 'range'; input.min = String(m.min); input.max = String(m.max); input.step = String(m.step); input.value = String(params[m.key]);
    input.oninput = () => { const v = Number(input.value); try { validatePhysicalParams({ ...params, [m.key]: v }); params[m.key] = v as never; (label.querySelector('output') as HTMLOutputElement).value = String(v); (label.querySelector('.field-error') as HTMLElement).textContent = ''; onChange(m.key, v); } catch (e) { input.value = String(params[m.key]); (label.querySelector('.field-error') as HTMLElement).textContent = e instanceof Error ? e.message : String(e); } };
    label.append(input); group.append(label);
  }
}
