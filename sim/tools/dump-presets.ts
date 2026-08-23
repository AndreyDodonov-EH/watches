// Write every preset as a full params JSON into presets/ — the input format of
// firmware/tools/gen_params.py. Run: npm run dump:presets [outDir]
declare const process: any; declare function require(m: string): any;
const fs = require('fs'), path = require('path');
import { PRESETS, presetParams } from '../src/params';

const out = process.argv[2] ?? path.join(process.cwd(), '..', 'presets');
for (const e of PRESETS) {
  const f = path.join(out, e.id + '.json');
  fs.writeFileSync(f, JSON.stringify(presetParams(e), null, 2) + '\n');
  console.log(f);
}
