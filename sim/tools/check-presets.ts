// Coherence check for the signature presets: every preset declares a Material and the numbers
// must sit inside that material's ranges (presets/PRESETS.md). Run: npm run check:presets
declare const process: any;
import { PRESETS, presetParams } from '../src/params';
import { coherenceIssues } from '../src/material/coherence';

let fails = 0;
for (const e of PRESETS) {
  if (!e.mat) { console.log(`${e.id}: (no material — skipped)`); continue; }
  const bad = coherenceIssues(presetParams(e), e.mat);
  console.log(`${e.id}: ${bad.length ? 'FAIL' : 'ok'}`);
  for (const b of bad) console.log(`  - ${b}`);
  fails += bad.length;
}
if (fails) { console.log(`${fails} violation(s)`); process.exit(1); }
