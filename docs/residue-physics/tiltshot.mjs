// Screenshot a slug sliding along a tilted vertical watch (the residue-behind-a-receding-line case).
// Run from sim/ with the dev server up (see .claude/skills/run-sim):
//   NOFIZZ=1 node ../docs/residue-physics/tiltshot.mjs /tmp/out ../docs/residue-physics/preset.json 1.0 1.6 2.6
// Starts upright (along -1), then tilts to ALONG2 / ACROSS2 (default 0.7 / 0.7: held sideways, upside down
// enough that the free slug slides up and its home edge recedes, slanted); writes <prefix>-<t>.png at each
// time t (s). PORT=5191 targets a second dev server (e.g. a HEAD worktree for before/after); SC = sim scale.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const { chromium } = createRequire(`${process.cwd()}/`)('playwright');
const [prefix, presetFile, ...times] = process.argv.slice(2);
const preset = JSON.parse(fs.readFileSync(presetFile, 'utf8')); delete preset.v; if (process.env.NOFIZZ) preset.fizz = false;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 2300, height: 1600 } });
await page.goto(`http://localhost:${process.env.PORT || 5190}/?fresh=1&scale=${process.env.SC || 1}&cuff=0&t=10:40&along=-1`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.sim, null, { timeout: 8000 });
await page.evaluate((pr) => Object.assign(window.sim.params, pr), preset);
const set = (id, v) => page.evaluate(([id, v]) => { const s = document.getElementById(id); s.value = String(v); s.dispatchEvent(new Event('input')); }, [id, v]);
await page.waitForTimeout(1500); await set('across', +(process.env.ACROSS2 ?? 0.7)); await set('along', +(process.env.ALONG2 ?? 0.7));
const t0 = Date.now();
for (const t of times.map(Number)) {
  const wait = t * 1000 - (Date.now() - t0); if (wait > 0) await page.waitForTimeout(wait);
  await page.locator('#viewport').screenshot({ path: `${prefix}-${t}.png` });
}
await browser.close();
