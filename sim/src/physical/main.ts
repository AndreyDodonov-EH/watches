import './style.css';
import { PANEL_H, PANEL_W } from '@spec/layout';
import { fillLevels } from '../physics';
import { PhysicalRenderer } from './render';
import { blitPhysical } from './output';
import { RodPreview } from './preview';
import { DEFAULT_PHYSICAL_PARAMS, PHYSICAL_META, validatePhysicalParams, type PhysicalParams } from './model';
import { controls } from './ui';
import { exportPhysical, importPhysical, loadPhysical, savePhysical } from './persistence';
import { appearance, BACKGROUNDS, DEFAULT_APPEARANCE_NAMES, DIGITS, material, MATERIALS } from './materials';
import type { PhysicalAppearance } from './appearance';
import { PhysicalDevice, type LinkKind } from './device';

const root = document.getElementById('physical-app')!;
const params: PhysicalParams = { ...(loadPhysical() ?? DEFAULT_PHYSICAL_PARAMS) };
const renderer = new PhysicalRenderer();
const rodPreview = new RodPreview();
const device = new PhysicalDevice();
const img = new ImageData(PANEL_W, PANEL_H);
let timeMode: 'real' | 'demo' | 'set' = 'set';
let demoSpeed = 60;
const selected = new Date();
selected.setHours(10, 9, 0, 0);
let demoStarted = performance.now(), demoBase = selected.getTime();
let visual: PhysicalAppearance = appearance(DEFAULT_APPEARANCE_NAMES.background, DEFAULT_APPEARANCE_NAMES.digits);
let frameCount = 0, lastFps = performance.now(), renderMs = 0, busy = false;

root.innerHTML = `<header><h1>Liquid Watch · physical lab <a href="./">legacy simulator</a></h1><span class="notice" id="notice"></span></header>
<div class="toolbar"><button id="connect">connect</button><select id="link"><option value="serial">Web Serial</option><option value="ble">Bluetooth</option></select><button id="pull">pull</button><button id="push">push physical</button><button id="legacy">return legacy device</button><select id="material"><option value="">material preset…</option>${Object.keys(MATERIALS).map(k => `<option>${k}</option>`).join('')}</select><select id="background"><option value="">background…</option>${Object.keys(BACKGROUNDS).map(k => `<option>${k}</option>`).join('')}</select><select id="digits"><option value="">digits…</option>${Object.keys(DIGITS).map(k => `<option>${k}</option>`).join('')}</select><select id="view"><option value="raw">raw panel</option><option value="rod">6 mm acrylic rods</option></select><button id="export">export</button><label><input id="import" type="file" accept="application/json"></label></div>
<p class="notice" id="status">offline · physical capability unverified</p>
<div class="lab"><section class="stage"><canvas id="physical-canvas" width="${PANEL_W}" height="${PANEL_H}"></canvas><p class="prototype-note">Optical prototype · no slosh or film yet. Oil absorption is an estimate at 20°C. Background/digits are simulator palettes; device settings last until restart; browser configuration is saved.</p>
<div class="stats"><span id="fps">0 fps</span><span id="rebuild">rebuild 0 ms</span><span id="clock">10:09:00</span><span>phase 1 · fixed columns</span></div>
<fieldset><legend>Time</legend><div class="toolbar"><label><input type="radio" name="time" value="real"> real</label><label><input type="radio" name="time" value="demo"> demo × <input id="speed" type="number" value="60" min="0" max="3600" style="width:4em"></label><label><input type="radio" name="time" value="set" checked> selected <input id="hour" type="number" min="0" max="23" value="10" style="width:3em">:<input id="minute" type="number" min="0" max="59" value="9" style="width:3em"></label><button id="send-time">send selected time</button></div></fieldset>
</section>
<aside class="controls" id="controls"></aside></div>`;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const physicalCanvas = $<HTMLCanvasElement>('physical-canvas');
const physicalCtx = physicalCanvas.getContext('2d')!;

function currentDate(): Date {
  if (timeMode === 'real') return new Date();
  if (timeMode === 'demo') return new Date(demoBase + (performance.now() - demoStarted) * demoSpeed);
  return new Date(selected);
}

function clockSnapshot(): { date: Date; speed: number } {
  return {
    date: timeMode === 'set' ? dateFromUi() : currentDate(),
    speed: timeMode === 'demo' ? demoSpeed : timeMode === 'real' ? 1 : 0,
  };
}

function render(): void {
  const start = performance.now(), date = currentDate();
  $('clock').textContent = date.toLocaleTimeString([], { hour12: false });
  const levels = fillLevels(date);
  let pixels = renderer.render(params, levels.hours, levels.minutes, visual);
  if ($<HTMLSelectElement>('view').value === 'rod') pixels = rodPreview.apply(pixels, params);
  blitPhysical(pixels, img);
  physicalCtx.putImageData(img, 0, 0);
  renderMs = performance.now() - start;
  $('rebuild').textContent = `render ${renderMs.toFixed(1)} ms · rebuild ${renderer.lastRebuildMs.toFixed(1)} ms`;
  frameCount++;
}

function tick(): void {
  render();
  const now = performance.now();
  if (now - lastFps > 1000) {
    $('fps').textContent = `${Math.round(frameCount * 1000 / (now - lastFps))} fps`;
    frameCount = 0;
    lastFps = now;
  }
  requestAnimationFrame(tick);
}

function notice(text: string, error = false): void {
  $('status').textContent = text;
  $('status').classList.toggle('error', error);
}
const reportError = (error: unknown) => notice(error instanceof Error ? error.message : String(error), true);

function save(): void {
  try { savePhysical(params); }
  catch { notice('Browser storage unavailable; export to keep this configuration.', true); }
}

function rebuildControls(): void {
  $('controls').replaceChildren();
  controls($('controls'), params, PHYSICAL_META, () => { save(); render(); });
}

function dateFromUi(): Date {
  const hour = $<HTMLInputElement>('hour').value.trim();
  const minute = $<HTMLInputElement>('minute').value.trim();
  const h = hour === '' ? NaN : Number(hour), m = minute === '' ? NaN : Number(minute);
  if (!Number.isInteger(h) || h < 0 || h > 23 || !Number.isInteger(m) || m < 0 || m > 59) {
    throw new Error('Selected time must be valid.');
  }
  const next = new Date(selected);
  next.setHours(h, m, 0, 0);
  return next;
}

function syncTimeMode(): void {
  document.querySelector<HTMLInputElement>(`input[name=time][value=${timeMode}]`)!.checked = true;
}

function setTimeMode(next: typeof timeMode): void {
  try {
    if (next === 'set') selected.setTime(dateFromUi().getTime());
    if (next === 'demo') {
      demoBase = currentDate().getTime();
      demoStarted = performance.now();
    }
    timeMode = next;
  } catch (error) { reportError(error); }
  syncTimeMode();
}

for (const radio of document.querySelectorAll<HTMLInputElement>('input[name=time]')) {
  radio.onchange = () => setTimeMode(radio.value as typeof timeMode);
}
$('speed').oninput = () => {
  try {
    const raw = $<HTMLInputElement>('speed').value.trim();
    const value = raw === '' ? NaN : Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > 3600) throw new Error('Demo speed must be 0–3600.');
    demoBase = currentDate().getTime();
    demoStarted = performance.now();
    demoSpeed = value;
    timeMode = 'demo';
    syncTimeMode();
  } catch (error) { reportError(error); }
};
for (const id of ['hour', 'minute']) $(id).oninput = () => setTimeMode('set');

// A lock spans the entire transaction, including selection and clock synchronization.
async function runBusy(task: () => Promise<void>): Promise<void> {
  if (busy) return;
  busy = true;
  updateActions();
  try { await task(); }
  catch (error) { reportError(error); }
  finally { busy = false; updateActions(); }
}

$('connect').onclick = () => runBusy(async () => {
  if (device.transport.connected) {
    await device.disconnect();
    notice('offline');
  } else {
    await device.connect($<HTMLSelectElement>('link').value as LinkKind);
  }
});
$('push').onclick = () => runBusy(async () => {
  const snapshot = validatePhysicalParams(params), clock = clockSnapshot();
  await device.push(snapshot);
  await device.select('physical');
  await device.setTime(clock.date, clock.speed);
  notice('physical parameters committed · renderer selected');
});
$('pull').onclick = () => runBusy(async () => {
  Object.assign(params, await device.pull());
  save();
  rebuildControls();
  notice('physical parameters pulled');
});
$('legacy').onclick = () => runBusy(async () => {
  await device.select('legacy');
  notice('device returned to legacy renderer');
});
$('send-time').onclick = () => runBusy(async () => {
  const clock = clockSnapshot();
  await device.setTime(clock.date, clock.speed);
  notice('time sent');
});

$('material').onchange = () => {
  Object.assign(params, material($<HTMLSelectElement>('material').value, params));
  save();
  rebuildControls();
};
$('background').onchange = () => {
  const name = $<HTMLSelectElement>('background').value;
  if (name) visual = appearance(name, $<HTMLSelectElement>('digits').value || DEFAULT_APPEARANCE_NAMES.digits);
  render();
};
$('digits').onchange = () => {
  const name = $<HTMLSelectElement>('digits').value;
  if (name) visual = appearance($<HTMLSelectElement>('background').value || DEFAULT_APPEARANCE_NAMES.background, name);
  render();
};
$('view').onchange = render;
$('export').onclick = () => {
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(new Blob([exportPhysical(params)], { type: 'application/json' }));
  anchor.download = 'liquid-watch-physical.json';
  anchor.click();
  URL.revokeObjectURL(anchor.href);
};
$('import').onchange = async () => {
  const file = $<HTMLInputElement>('import').files?.[0];
  if (!file) return;
  try {
    Object.assign(params, importPhysical(await file.text()));
    save();
    rebuildControls();
  } catch (error) { reportError(error); }
};

function updateActions(): void {
  for (const id of ['pull', 'push', 'legacy', 'send-time']) {
    $<HTMLButtonElement>(id).disabled = busy || !device.capable;
  }
  $('connect').textContent = device.transport.connected ? 'disconnect' : 'connect';
  $<HTMLButtonElement>('connect').disabled = busy;
  $<HTMLSelectElement>('link').disabled = busy || device.transport.connected;
}
device.onStatus = (text) => { notice(text); updateActions(); };
rebuildControls();
updateActions();
tick();
