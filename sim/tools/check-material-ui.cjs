/* Physical-material mode on the main sim page (src/material/ui.ts). Run against a Vite server:
 *   MATERIAL_UI_URL=http://localhost:5190/ node tools/check-material-ui.cjs   (npm run check:material-ui) */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { readFileSync, writeFileSync, mkdtempSync } = require('node:fs');
const { resolve, join } = require('node:path');
const { tmpdir } = require('node:os');

const url = (process.env.MATERIAL_UI_URL || 'http://localhost:5190/').replace(/\?.*$/, '');
// ownership sets straight from the sources (the page does not export them)
const list = (src, name) => {
  const m = src.match(new RegExp(`${name} = \\[([^\\]]*)\\]`));
  assert(m, `${name} not found`);
  return [...m[1].matchAll(/['"]([A-Za-z0-9]+)['"]/g)].map((x) => x[1]);
};
const deriveSrc = readFileSync(resolve(__dirname, '../src/material/derive.ts'), 'utf8');
const modelSrc = readFileSync(resolve(__dirname, '../src/material/model.ts'), 'utf8');
const LOCKED = new Set([...list(deriveSrc, 'DERIVED_KEYS'), ...list(deriveSrc, 'FIXED_KEYS')]);
const DESIGN = new Set(list(modelSrc, 'DESIGN_KEYS'));

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1500, height: 1200 } });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t) => { window.__clip = t; } } });
  });
  const page = await context.newPage();
  const errors = [], warnings = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'warning') warnings.push(m.text()); });
  const go = async (q = '') => {
    await page.goto(url + q, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.sim && window.sim.material);
  };
  const sim = (f, arg) => page.evaluate(f, arg);
  const paramsJson = () => sim(() => JSON.stringify(window.sim.params));
  /** { key: [disabled flags of the row's inputs] } for every legacy panel row. */
  const rowStates = () => sim(() => Object.fromEntries([...document.querySelectorAll('#panel .row[data-key]')]
    .map((r) => [r.dataset.key, [...r.querySelectorAll('input,select')].map((i) => i.disabled)])));
  // typed value + change, as a user commit (works inside collapsed panel groups too)
  const setNumber = (sel, v) => sim(([sel, v]) => {
    const i = document.querySelector(sel); i.value = String(v); i.dispatchEvent(new Event('change', { bubbles: true }));
  }, [sel, v]);
  const status = () => page.locator('#mat-status').textContent();
  const statusKind = () => sim(() => document.querySelector('#mat-status').className);

  try {
    // ---- 1. entering material mode locks derived / fixed legacy inputs, design inputs stay editable
    await go('?fresh=1');
    assert.equal(await sim(() => window.sim.material.mode), 'legacy');
    let rows = await rowStates();
    assert(Object.keys(rows).length > 100, 'legacy panel rows found');
    for (const [k, d] of Object.entries(rows)) assert(d.every((x) => !x), `legacy mode: ${k} enabled`);
    await page.check('#mat-mode');
    assert.equal(await sim(() => window.sim.material.mode), 'material');
    rows = await rowStates();
    let locked = 0, open = 0;
    for (const [k, d] of Object.entries(rows)) {
      assert(LOCKED.has(k) || DESIGN.has(k), `${k} has an owner`);
      assert(d.length > 0, `${k} has inputs`);
      if (LOCKED.has(k)) { locked++; assert(d.every((x) => x), `material mode: derived/fixed ${k} disabled (${d})`); }
      else { open++; assert(d.every((x) => !x), `material mode: design ${k} enabled (${d})`); }
    }
    assert(locked > 40 && open > 40, `locked ${locked}, design ${open}`);
    assert.equal(await page.locator('#lens').isDisabled(), false);
    const design = await sim(() => window.sim.material.design);
    assert.equal(Object.keys(design).length, DESIGN.size, 'design taken from every DESIGN_KEY of the current params');
    console.log(`enter material mode: ${locked} derived/fixed rows locked, ${open} design rows editable: ok`);

    // ---- 2. viscosity drives freeDamp monotonically (olive oil: no gas, so every viscosity is allowed)
    await page.selectOption('#mat-preset', 'olive-oil');
    assert.equal(await sim(() => window.sim.material.material.viscosity), 84);
    const damps = [];
    for (const v of [0.3, 1, 3, 10, 84, 400, 2000, 20000, 100000]) {
      await setNumber('#mat-viscosity-n', v);
      assert.equal(await sim(() => window.sim.material.material.viscosity), v);
      assert.match(await statusKind(), /\bok\b/, `viscosity ${v}: ${await status()}`);
      damps.push(await sim(() => window.sim.params.freeDamp));
    }
    for (let i = 1; i < damps.length; i++) assert(damps[i] >= damps[i - 1], `freeDamp non-decreasing: ${damps}`);
    assert(damps.at(-1) > damps[0] + 5, `freeDamp spans the classes: ${damps}`);
    // the locked legacy twin shows the derived value
    assert.equal(await page.inputValue('#panel .row[data-key=freeDamp] input[type=number]'), String(await sim(() => window.sim.params.freeDamp)));
    // the log slider: full right = the schema maximum
    await sim(() => { const r = document.getElementById('mat-viscosity'); r.value = r.max; r.dispatchEvent(new Event('input', { bubbles: true })); });
    assert.equal(await sim(() => window.sim.material.material.viscosity), 100000);
    await setNumber('#mat-viscosity-n', 84);
    console.log(`viscosity → freeDamp ${damps.map((d) => d.toFixed(2)).join(' ≤ ')}: ok`);

    // ---- 3. rejections leave the params untouched (material field and design field)
    let before = await paramsJson();
    await page.selectOption('#mat-phase', '1');
    assert.match(await statusKind(), /\berr\b/);
    assert.match(await status(), /rejection 3 \(plasma\): a plasma must emit/);
    assert.equal(await paramsJson(), before, 'plasma without emission: params unchanged');
    await page.selectOption('#mat-phase', '0');
    assert.match(await statusKind(), /\bok\b/);
    before = await paramsJson();
    await setNumber('#panel .row[data-key=hoursY] input[type=number]', 500);
    assert.match(await status(), /rejection 7 \(layout\): hoursY 500/);
    assert.equal(await paramsJson(), before, 'design edit rejected: params unchanged');
    await setNumber('#panel .row[data-key=hoursY] input[type=number]', 3);
    assert.match(await statusKind(), /\bok\b/);
    assert.equal(await sim(() => window.sim.params.hoursY), 3);
    await setNumber('#panel .row[data-key=tickBright] input[type=number]', 1.2);
    assert.equal(await sim(() => window.sim.material.design.tickBright), 1.2);
    assert.equal(await sim(() => window.sim.params.tickBright), 1.2);
    // a design-only edit is live-pushed: a stub transport (connected, recording setParam) must receive
    // tickBright after the accepted re-derive (its key is in onDerived's changed list)
    await sim(() => {
      window.__pushed = [];
      const t = window.sim.links.serial;
      Object.defineProperty(t, 'connected', { configurable: true, get: () => true });
      t.setParam = async (k, v) => { window.__pushed.push([k, v]); return true; };
    });
    await setNumber('#panel .row[data-key=tickBright] input[type=number]', 1.1);
    assert.match(await statusKind(), /\bok\b/, `tickBright 1.1: ${await status()}`);
    assert.equal(await sim(() => window.sim.params.tickBright), 1.1);
    await page.waitForFunction(() => window.__pushed.some(([k]) => k === 'tickBright'), null, { timeout: 2000 })
      .catch(() => { throw new Error('design-only edit tickBright 1.2 → 1.1 was not live-pushed'); });
    const pushed = await sim(() => window.__pushed);
    assert.deepEqual(pushed.filter(([k]) => k === 'tickBright'), [['tickBright', 1.1]], `pushed ${JSON.stringify(pushed)}`);
    await sim(() => { const t = window.sim.links.serial; delete t.connected; delete t.setParam; });
    console.log(`design-only edit (tickBright 1.2 → 1.1) live-pushed through a stub transport (${pushed.map(([k]) => k).join(', ')}): ok`);
    // out-of-range typed value is refused before it reaches the state
    await setNumber('#mat-ior-n', 3);
    assert.match(await status(), /outside \[1, 1\.8\]/);
    assert.equal(await sim(() => window.sim.material.material.ior), 1.47);
    console.log('rejections (plasma without emission, layout) keep params; design edits re-derive: ok');

    // ---- 4. reload restores mode / material / design
    await setNumber('#mat-surfaceTension-n', 40);
    const saved = await sim(() => JSON.stringify(window.sim.material));
    const savedParams = await paramsJson();
    await go('');
    assert.equal(await sim(() => JSON.stringify(window.sim.material)), saved);
    assert.equal(await paramsJson(), savedParams);
    assert.equal(await page.isChecked('#mat-mode'), true);
    assert.equal(await page.locator('#panel .row[data-key=freeDamp] input[type=range]').isDisabled(), true);
    console.log('reload restores mode, material, design and derived params: ok');

    // ---- 5. ?fresh=1 is legacy
    await go('?fresh=1');
    assert.equal(await sim(() => window.sim.material.mode), 'legacy');
    assert.equal(await page.isChecked('#mat-mode'), false);
    assert.equal(await page.locator('#panel .row[data-key=freeDamp] input[type=range]').isDisabled(), false);
    console.log('?fresh=1 starts in legacy mode: ok');

    // ---- 6. export → import round trip; URL material / m. / p. overrides
    await go('?fresh=1&material=frizzante&m.gasLevel=0.3&p.tickBright=1.2&p.freeDamp=3');
    assert.equal(await sim(() => window.sim.material.mode), 'material');
    assert.equal(await sim(() => window.sim.material.material.gasLevel), 0.3);
    assert.equal(await sim(() => window.sim.material.design.tickBright), 1.2);
    assert.equal(await sim(() => window.sim.params.tickBright), 1.2);
    assert.notEqual(await sim(() => window.sim.params.freeDamp), 3);
    assert(warnings.some((w) => /p\.freeDamp/.test(w)), 'non-design p. key warned');
    await page.selectOption('#mat-preset', 'frizzante');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#mat-export')]);
    assert.equal(dl.suggestedFilename(), 'frizzante.json');
    const text = readFileSync(await dl.path(), 'utf8');
    const env = JSON.parse(text);
    const state = await sim(() => window.sim.material);
    assert.equal(env.kind, 'liquid-watch-material');
    assert.deepEqual(env.material, state.material);
    assert.deepEqual(env.design, state.design);
    assert.equal(env.provenance.viscosity, 'measured');
    const exportedParams = await paramsJson();
    await page.selectOption('#mat-preset', 'blood');
    assert.notEqual(await paramsJson(), exportedParams);
    const file = join(mkdtempSync(join(tmpdir(), 'mat-ui-')), 'frizzante.json');
    writeFileSync(file, text);
    await page.setInputFiles('#mat-import-file', file);
    await page.waitForFunction((m) => JSON.stringify(window.sim.material.material) === m, JSON.stringify(state.material));
    assert.deepEqual(await sim(() => window.sim.material.design), state.design);
    assert.equal(await paramsJson(), exportedParams);
    assert.equal(await page.inputValue('#mat-preset'), 'frizzante');
    // a legacy Params export is refused
    const legacy = join(mkdtempSync(join(tmpdir(), 'mat-ui-')), 'params.json');
    writeFileSync(legacy, exportedParams);
    await page.setInputFiles('#mat-import-file', legacy);
    await page.waitForFunction(() => /import rejected/.test(document.querySelector('#mat-status').textContent));
    assert.equal(await paramsJson(), exportedParams);
    console.log('URL material / m. / p. overrides, export → import round trip, legacy file refused: ok');

    // ---- 6b. a non-built-in envelope keeps its name and provenance: import → state → reload → export
    const custom = {
      kind: 'liquid-watch-material', version: env.version, name: 'measured oil',
      material: { ...state.material, viscosity: 91.5, density: 912, surfaceTension: 33, gasMode: 0, gasLevel: 0 },
      design: state.design,
      provenance: { viscosity: 'measured', density: 'measured', surfaceTension: 'measured', ior: 'estimated', absorptionB: 'artistic' },
    };
    const customFile = join(mkdtempSync(join(tmpdir(), 'mat-ui-')), 'measured-oil.json');
    writeFileSync(customFile, JSON.stringify(custom));
    await page.setInputFiles('#mat-import-file', customFile);
    await page.waitForFunction(() => window.sim.material.name === 'measured oil');
    assert.match(await statusKind(), /\bok\b/, `measured oil: ${await status()}`);
    assert.equal(await page.inputValue('#mat-preset'), '', 'a custom material matches no preset');
    assert.deepEqual(await sim(() => window.sim.material.provenance), custom.provenance);
    await sim(() => new Promise((r) => setTimeout(r, 400))); // the session save is debounced (250 ms)
    await go('');
    assert.equal(await sim(() => window.sim.material.name), 'measured oil', 'name survives a reload');
    assert.deepEqual(await sim(() => window.sim.material.provenance), custom.provenance, 'provenance survives a reload');
    const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('#mat-export')]);
    const back = JSON.parse(readFileSync(await dl2.path(), 'utf8'));
    assert.equal(back.name, 'measured oil');
    assert.deepEqual(back.provenance, custom.provenance);
    assert.deepEqual(back.material, custom.material);
    assert.deepEqual(back.design, custom.design);
    // selecting a built-in preset replaces the metadata with the preset's
    await page.selectOption('#mat-preset', 'frizzante');
    assert.equal(await sim(() => window.sim.material.name), env.name);
    assert.deepEqual(await sim(() => window.sim.material.provenance), env.provenance);
    console.log('custom envelope "measured oil": name and provenance kept through import, reload and export; a preset replaces them: ok');

    // ---- 7. copy derived legacy JSON
    await page.click('#mat-copy');
    await page.waitForFunction(() => typeof window.__clip === 'string');
    assert.equal(await sim(() => window.__clip), await paramsJson());
    console.log('copy derived legacy JSON = JSON.stringify(params): ok');

    // ---- 8. leaving material mode unlocks everything and keeps params
    before = await paramsJson();
    await page.uncheck('#mat-mode');
    assert.equal(await sim(() => window.sim.material.mode), 'legacy');
    for (const [k, d] of Object.entries(await rowStates())) assert(d.every((x) => !x), `after leaving: ${k} enabled`);
    assert.equal(await paramsJson(), before);
    assert.equal(await page.locator('#mat-viscosity').isDisabled(), true);
    console.log('leave material mode: inputs re-enabled, params kept: ok');

    assert.deepEqual(errors, []);
    console.log('no page errors: ok');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
