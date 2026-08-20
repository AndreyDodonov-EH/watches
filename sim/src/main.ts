import './style.css';
import { PANEL_W, PANEL_H, HOURS_TUBE_Y, MINUTES_TUBE_Y, TUBE_HEIGHT_PX, BRIDGE_Y0, BRIDGE_Y1 } from '@spec/layout';
import { PRESET_CONCEPT, PRESET_MINT, PRESET_NEON, type Params } from './params';
import { ImuFilter, PHYS_DT, fillLevels, newTube, stepTube, type TiltInput } from './physics';
import { renderFrame, blit, stepFizz, fb, loadSprites } from './render';
import { DEFAULT_OVERLAY, LEATHER_PAD_X, LEATHER_PAD_Y, applyOverlay, buildOverlayDom, drawLens } from './overlay';
import { DEFAULT_VIEW, loadSession, saveSession } from './persist';
import { buildPanel } from './ui';
loadSprites('assets/');
import { SerialImu } from './serial';

// ---------- state ----------
// Params *and* view state are restored from localStorage and saved again on every edit (persist.ts).
// `?fresh=1` ignores the store and starts from the code defaults — use it after DEFAULT_PARAMS changes.
const url = new URLSearchParams(location.search);
const session = loadSession(url.get('fresh') === '1');
const params: Params = session.params;
const overlay = session.view.overlay;
const manual = session.view.manual;             // sliders / drag
const setClock = session.view.setClock;
let { scale, showGrid, paused, timeMode, demoSpeed } = session.view;  // demoSpeed = demo s per real s
const hours = newTube(), minutes = newTube();
const input: TiltInput = { along: 0, across: 0, gyroAlong: 0, gyroAcross: 0 };
const imuFilter = new ImuFilter();
let inputSource: 'manual' | 'device' | 'serial' = 'manual'; // not persisted: device/serial need a gesture
let demoClock = Date.now();

// ---------- DOM ----------
const app = document.getElementById('app')!;
app.innerHTML = `
<header>
  <h1>Liquid Watch — sim</h1>
  <div class="top">
    <label>scale <select id="scale"><option value="0.33">0.33 (≈ real size @96 dpi)</option><option value="0.5" selected>0.5</option><option value="0.75">0.75</option><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option></select></label>
    <label><input type="checkbox" id="ovl" checked> leather cuff</label>
    <label>leather <select id="leather"><option>brown</option><option>black</option><option>none</option></select></label>
    <label>lens <input type="range" id="lens" min="0" max="1" step="0.05" value="0.6"></label>
    <label>lens curve <input type="range" id="lenscurve" min="0.3" max="3" step="0.05" value="1"></label>
    <label><input type="checkbox" id="lenssmooth"> lens smooth</label>
    <label>gloss <input type="range" id="gloss" min="0" max="1" step="0.05" value="0.55"></label>
    <label>slot inset <input type="range" id="inset" min="0" max="40" step="1" value="10"></label>
    <label><input type="checkbox" id="grid"> layout grid</label>
    <label><input type="checkbox" id="pause"> pause</label>
    <button id="resetview">reset view</button>
    <span id="fps"></span>
  </div>
</header>
<main>
  <section class="stage">
    <div id="viewport" class="viewport"><div id="panelwrap" class="panelwrap">
      <canvas id="fbc" width="${PANEL_W}" height="${PANEL_H}"></canvas>
      <canvas id="lensc" width="${PANEL_W}" height="${PANEL_H}"></canvas>
      <canvas id="gridc" width="${PANEL_W}" height="${PANEL_H}"></canvas>
    </div></div>
    <div class="controls">
      <fieldset><legend>Time</legend>
        <label><input type="radio" id="tm-real" name="tm" value="real" checked> real</label>
        <label><input type="radio" id="tm-demo" name="tm" value="demo"> demo ×<input type="number" id="demospeed" value="60" min="1" max="3600" style="width:5em"></label>
        <label><input type="radio" id="tm-set" name="tm" value="set"> set <input type="number" id="seth" value="10" min="0" max="23" style="width:3.5em">:<input type="number" id="setm" value="9" min="0" max="59" style="width:3.5em"></label>
        <span id="clock"></span>
      </fieldset>
      <fieldset><legend>Tilt input</legend>
        <label><input type="radio" name="src" value="manual" checked> sliders / drag on panel</label>
        <label><input type="radio" name="src" value="device"> device orientation (phone)</label>
        <label><input type="radio" name="src" value="serial"> board via Web Serial <button id="serialbtn">connect</button> <span id="serialst"></span></label>
        <div id="imuraw" class="mono"></div>
        <label>along <input type="range" id="along" min="-1" max="1" step="0.01" value="0"> <output id="alongv">0</output> g</label>
        <label>across <input type="range" id="across" min="-1" max="1" step="0.01" value="0"> <output id="acrossv">0</output> g</label>
        <button id="center">centre</button> <button id="flick">flick →</button> <button id="flickl">← flick</button> <button id="shake">shake</button>
      </fieldset>
    </div>
  </section>
  <aside id="panel"></aside>
</main>`;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const wrap = document.getElementById('panelwrap')!;
const fbc = document.getElementById('fbc') as HTMLCanvasElement;
const lensc = document.getElementById('lensc') as HTMLCanvasElement;
const gridc = document.getElementById('gridc') as HTMLCanvasElement;
const fbctx = fbc.getContext('2d')!;
const img = fbctx.createImageData(PANEL_W, PANEL_H);
const ovlDom = buildOverlayDom(wrap);
applyOverlay(ovlDom, overlay);

// ---------- persistence ----------
// One delegated listener covers every control on the page (top bar, time, tilt, params panel);
// programmatic changes (presets, import, drag-tilt, reset) call save() explicitly.
const save = (): void => saveSession({ params, view: { scale, showGrid, paused, timeMode, demoSpeed, setClock, manual, overlay } });
app.addEventListener('input', save);
app.addEventListener('change', save);

const viewport = $('viewport');
const setScale = () => {
  const padX = overlay.enabled ? LEATHER_PAD_X : 0, padY = overlay.enabled ? LEATHER_PAD_Y : 0;
  viewport.style.width = `${(PANEL_W + 2 * padX) * scale}px`; viewport.style.height = `${(PANEL_H + 2 * padY) * scale}px`;
  wrap.style.transform = `translate(${padX * scale}px, ${padY * scale}px) scale(${scale})`;
  wrap.classList.toggle('smooth', scale < 2); // pixelated upscale only at ≥2; bilinear when shrinking
};
setScale();
$('scale').oninput = (e) => { scale = +(e.target as HTMLSelectElement).value; setScale(); };
$('ovl').oninput = (e) => { overlay.enabled = (e.target as HTMLInputElement).checked; applyOverlay(ovlDom, overlay); setScale(); };
$('leather').oninput = (e) => { overlay.leather = (e.target as HTMLSelectElement).value as any; applyOverlay(ovlDom, overlay); };
$('lens').oninput = (e) => { overlay.lens = +(e.target as HTMLInputElement).value; };
$('lenscurve').oninput = (e) => { overlay.lensCurve = +(e.target as HTMLInputElement).value; };
$('lenssmooth').oninput = (e) => { overlay.lensSmooth = (e.target as HTMLInputElement).checked; };
$('gloss').oninput = (e) => { overlay.gloss = +(e.target as HTMLInputElement).value; applyOverlay(ovlDom, overlay); };
$('inset').oninput = (e) => { overlay.slotInset = +(e.target as HTMLInputElement).value; applyOverlay(ovlDom, overlay); };
$('grid').oninput = (e) => { showGrid = (e.target as HTMLInputElement).checked; drawGrid(); };
$('pause').oninput = (e) => { paused = (e.target as HTMLInputElement).checked; };
for (const r of document.querySelectorAll<HTMLInputElement>('input[name=tm]')) r.oninput = () => { timeMode = r.value as any; demoClock = Date.now(); };
for (const r of document.querySelectorAll<HTMLInputElement>('input[name=src]')) r.oninput = () => { inputSource = r.value as any; if (inputSource === 'device') askOrientation(); };
$('demospeed').oninput = (e) => { demoSpeed = +(e.target as HTMLInputElement).value; };
$('seth').oninput = (e) => { setClock.h = +(e.target as HTMLInputElement).value; };
$('setm').oninput = (e) => { setClock.m = +(e.target as HTMLInputElement).value; };
$('resetview').onclick = () => {
  Object.assign(overlay, DEFAULT_OVERLAY); Object.assign(manual, DEFAULT_VIEW.manual); Object.assign(setClock, DEFAULT_VIEW.setClock);
  ({ scale, showGrid, paused, timeMode, demoSpeed } = DEFAULT_VIEW);
  syncView(); save();
};
const alongS = $<HTMLInputElement>('along'), acrossS = $<HTMLInputElement>('across');
const syncSliders = () => { alongS.value = String(manual.along); acrossS.value = String(manual.across); $('alongv').textContent = manual.along.toFixed(2); $('acrossv').textContent = manual.across.toFixed(2); };
alongS.oninput = () => { manual.along = +alongS.value; syncSliders(); };
acrossS.oninput = () => { manual.across = +acrossS.value; syncSliders(); };
$('center').onclick = () => { manual.along = 0; manual.across = 0; syncSliders(); save(); };

/** Push the whole view state into the DOM + derived layers. Inverse of what `save()` collects. */
function syncView(): void {
  $<HTMLSelectElement>('scale').value = String(scale);
  $<HTMLInputElement>('ovl').checked = overlay.enabled;
  $<HTMLSelectElement>('leather').value = overlay.leather;
  $<HTMLInputElement>('lens').value = String(overlay.lens);
  $<HTMLInputElement>('lenscurve').value = String(overlay.lensCurve);
  $<HTMLInputElement>('lenssmooth').checked = overlay.lensSmooth;
  $<HTMLInputElement>('gloss').value = String(overlay.gloss);
  $<HTMLInputElement>('inset').value = String(overlay.slotInset);
  $<HTMLInputElement>('grid').checked = showGrid;
  $<HTMLInputElement>('pause').checked = paused;
  $<HTMLInputElement>('demospeed').value = String(demoSpeed);
  $<HTMLInputElement>('seth').value = String(setClock.h);
  $<HTMLInputElement>('setm').value = String(setClock.m);
  $<HTMLInputElement>(`tm-${timeMode}`).checked = true;
  syncSliders();
  applyOverlay(ovlDom, overlay); setScale(); drawGrid();
}
let kick = 0;
$('flick').onclick = () => { kick = 400; };
$('flickl').onclick = () => { kick = -400; };
let shakeT = 0;
const SHAKE_T = 2.5;
$('shake').onclick = () => { shakeT = SHAKE_T; };

// drag on panel = tilt
let dragging = false;
wrap.addEventListener('pointerdown', (e) => { dragging = true; wrap.setPointerCapture(e.pointerId); });
wrap.addEventListener('pointerup', () => { dragging = false; save(); });
wrap.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const r = wrap.getBoundingClientRect();
  manual.along = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
  manual.across = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
  syncSliders();
});

// device orientation
const dev = { along: 0, across: 0, gyroAcross: 0 };
function askOrientation() {
  const D = DeviceOrientationEvent as any;
  const go = () => window.addEventListener('deviceorientation', (e) => {
    // phone held landscape like the watch: gamma tilts along (left/right end down), beta across
    dev.along = Math.sin(((e.gamma ?? 0) * Math.PI) / 180);
    dev.across = Math.sin(((e.beta ?? 0) * Math.PI) / 180);
  });
  if (typeof D?.requestPermission === 'function') D.requestPermission().then((s: string) => { if (s === 'granted') go(); });
  else go();
  window.addEventListener('devicemotion', (e) => { dev.gyroAcross = e.rotationRate?.beta ?? 0; });
}

// serial
const serial = new SerialImu();
$('serialbtn').onclick = async () => {
  if (!serial.supported) { $('serialst').textContent = 'Web Serial not supported (use Chrome)'; return; }
  if (serial.connected) { await serial.disconnect(); $('serialbtn').textContent = 'connect'; return; }
  try { await serial.connect(); $('serialbtn').textContent = 'disconnect'; (document.querySelector('input[name=src][value=serial]') as HTMLInputElement).checked = true; inputSource = 'serial'; }
  catch (e) { $('serialst').textContent = String(e); }
};
serial.onStatus = (s) => { $('serialst').textContent = s; };

// params panel
const panelUi = buildPanel($('panel'), params, { onChange: save });

// URL params, applied on top of the restored session — for reproducible states / screenshots:
//   ?fresh=1 (ignore the saved session) &preset=neon|mint|concept &t=10:09 &demo=120 &settle=1
//   &along=0.3 &across=0 &scale=3 &cuff=0 &lens=0.6 &lenscurve=1 &lenssmooth=1 &leather=black &grid=1
//   &p.<paramKey>=<value>   e.g. &p.liquid=%2339ff14&p.bubble=0
{
  const u = url;
  const preset = { neon: PRESET_NEON, mint: PRESET_MINT, concept: PRESET_CONCEPT }[u.get('preset') ?? ''];
  if (preset) Object.assign(params, preset);
  for (const [k, v] of u) if (k.startsWith('p.')) {
    const key = k.slice(2) as keyof Params; const cur = (params as any)[key];
    (params as any)[key] = typeof cur === 'boolean' ? v === '1' || v === 'true' : typeof cur === 'number' ? parseFloat(v) : v;
  }
  if (u.has('along')) manual.along = +u.get('along')!;
  if (u.has('across')) manual.across = +u.get('across')!;
  if (u.has('t')) { const [h, m] = u.get('t')!.split(':').map(Number); setClock.h = h; setClock.m = m; timeMode = 'set'; }
  if (u.has('demo')) { demoSpeed = +u.get('demo')!; timeMode = 'demo'; }
  if (u.has('scale')) scale = +u.get('scale')!;
  if (u.has('cuff')) overlay.enabled = u.get('cuff') === '1';
  if (u.has('lens')) overlay.lens = +u.get('lens')!;
  if (u.has('lenscurve')) overlay.lensCurve = +u.get('lenscurve')!;
  if (u.has('lenssmooth')) overlay.lensSmooth = u.get('lenssmooth') === '1';
  if (u.has('leather')) overlay.leather = u.get('leather') as typeof overlay.leather;
  if (u.has('grid')) showGrid = u.get('grid') === '1';
  if (u.has('settle')) for (let i = 0; i < 250; i++) physics(PHYS_DT); // springs at rest for screenshots
  panelUi.refresh(); syncView();
}

function drawGrid() {
  const g = gridc.getContext('2d')!;
  g.clearRect(0, 0, PANEL_W, PANEL_H);
  if (!showGrid) return;
  g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 1; g.setLineDash([4, 4]);
  for (const y of [HOURS_TUBE_Y, HOURS_TUBE_Y + TUBE_HEIGHT_PX, MINUTES_TUBE_Y, MINUTES_TUBE_Y + TUBE_HEIGHT_PX]) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(PANEL_W, y + 0.5); g.stroke(); }
  g.fillStyle = 'rgba(255,0,0,0.25)'; g.fillRect(0, BRIDGE_Y0, PANEL_W, BRIDGE_Y1 - BRIDGE_Y0);
  g.fillStyle = '#fff'; g.font = '10px monospace';
  g.fillText(`hours y=${HOURS_TUBE_Y}`, 4, HOURS_TUBE_Y - 3); g.fillText(`minutes y=${MINUTES_TUBE_Y}`, 4, MINUTES_TUBE_Y - 3); g.fillText('bridge (must stay black)', 4, BRIDGE_Y0 + 14);
}

// ---------- loop: fixed-step physics, decoupled render ----------
let acc = 0, last = performance.now(), frames = 0, fpsT = last;
function currentDate(): Date {
  if (timeMode === 'real') return new Date();
  if (timeMode === 'set') { const d = new Date(); d.setHours(setClock.h, setClock.m, 0, 0); return d; }
  return new Date(demoClock);
}
function physics(dt: number) {
  // choose input
  if (inputSource === 'manual') { input.along = manual.along; input.across = manual.across; input.gyroAcross = 0; imuFilter.reset(); }
  else {
    const raw = inputSource === 'device' ? { along: dev.along, across: dev.across, gyroAlong: 0, gyroAcross: dev.gyroAcross } : serial.last;
    Object.assign(input, imuFilter.step(raw, params, dt));
  }
  if (shakeT > 0) { // ~2.5 Hz wrist shake that dies out over SHAKE_T seconds
    shakeT -= dt; const env = Math.pow(shakeT / SHAKE_T, 1.5);
    input.along += Math.sin((SHAKE_T - shakeT) * 2 * Math.PI * 2.5) * 0.9 * env;
    input.gyroAcross += Math.cos((SHAKE_T - shakeT) * 2 * Math.PI * 2.5) * 120 * env;
  }
  if (kick !== 0) { input.gyroAcross += kick; kick = 0; }
  if (timeMode === 'demo') demoClock += dt * 1000 * demoSpeed;
  const f = fillLevels(currentDate());
  hours.fillTarget = f.hours; minutes.fillTarget = f.minutes;
  stepTube(hours, input, params, dt);
  stepTube(minutes, input, params, dt);
  stepFizz(params, dt);
}
function frame(now: number) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.25, (now - last) / 1000); last = now;
  if (!paused) { acc += dt; while (acc >= PHYS_DT) { physics(PHYS_DT); acc -= PHYS_DT; } }
  renderFrame(hours, minutes, params);
  blit(img); fbctx.putImageData(img, 0, 0);
  if (overlay.enabled && overlay.lens > 0) { lensc.style.display = 'block'; drawLens(fbc, lensc, overlay); } else lensc.style.display = 'none';
  frames++;
  if (now - fpsT > 1000) {
    $('fps').textContent = `${frames} fps · fill h=${hours.fillTarget.toFixed(3)} m=${minutes.fillTarget.toFixed(3)} · angle ${hours.angle.toFixed(1)}°`;
    frames = 0; fpsT = now;
  }
  const d = currentDate();
  $('clock').textContent = d.toTimeString().slice(0, 8);
  $('imuraw').textContent = inputSource === 'manual' ? '' : `in: along ${input.along.toFixed(2)} across ${input.across.toFixed(2)} gyro ${input.gyroAcross.toFixed(0)}` + (serial.connected ? ` | raw ${serial.raw}` : '');
}
requestAnimationFrame(frame);

// dev hook
(window as any).sim = { params, hours, minutes, fb, overlay };
