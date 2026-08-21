// Screenshot the sim viewport. Usage: node .claude/skills/run-sim/shot.mjs <out.png> [query]
//   query: sim URL params, e.g. "p.tickColorH=%23ff0000&p.ticksOnTop=1&t=10:09&settle=1"
// Run from sim/ (imports playwright from sim/node_modules). Dev server must be up on :5190.
import { createRequire } from 'node:module';
const { chromium } = createRequire(`${process.cwd()}/`)('playwright');
const [out = 'shot.png', query = ''] = process.argv.slice(2);
const url = `http://localhost:5190/?fresh=1&scale=2&settle=1&${query}`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1700, height: 1000 } });
page.on('console', (m) => m.type() === 'error' && console.log('console error:', m.text()));
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.sim, null, { timeout: 8000 });
await page.waitForTimeout(300);
await page.locator('#viewport').screenshot({ path: out });
console.log(out, url);
await browser.close();
