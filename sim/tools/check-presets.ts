// Coherence check for the signature presets: every preset declares a Material and the numbers
// must sit inside that material's ranges (presets/PRESETS.md), with its signature gas; every gas it lists
// must be in the catalogue and no preset may carry a fizz key of its own. Run: npm run check:presets
declare const process: any;
import { GAS_KEYS, GAS_MODELS, PRESETS, presetParams } from '../src/params';
import { coherenceIssues } from '../src/material/coherence';

let fails = 0;
for (const e of PRESETS) {
  const gasBad = [
    ...e.gas.filter((g) => !GAS_MODELS.some((m) => m.id === g)).map((g) => `unknown gas model ${g}`),
    ...GAS_KEYS.filter((k) => k in e.p).map((k) => `${k} set in the preset (gas comes from its gas model)`),
  ];
  if (gasBad.length) { console.log(`${e.id}: FAIL`); for (const b of gasBad) console.log(`  - ${b}`); fails += gasBad.length; continue; }
  if (!e.mat) { console.log(`${e.id}: (no material — skipped)`); continue; }
  const bad = coherenceIssues(presetParams(e), e.mat);
  console.log(`${e.id}: ${bad.length ? 'FAIL' : 'ok'}`);
  for (const b of bad) console.log(`  - ${b}`);
  fails += bad.length;
}
if (fails) { console.log(`${fails} violation(s)`); process.exit(1); }
