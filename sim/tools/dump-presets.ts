// Write every legacy preset as a full params JSON into presets/ — the input format of
// firmware/tools/gen_params.py — and the physical collection (src/material/presets.ts): its material
// files into presets/materials/ and its derived Params into presets/physical/ (same format as the legacy
// JSONs). Deterministic: the same sources write the same bytes. Run: npm run dump:presets [outDir]
declare const process: any; declare function require(m: string): any;
const fs = require('fs'), path = require('path');
import { PRESETS, presetParams } from '../src/params';
import { MATERIAL_PRESETS, materialPresetFile, physicalPresetFile } from '../src/material/presets';

const out = process.argv[2] ?? path.join(process.cwd(), '..', 'presets');
for (const e of PRESETS) {
  const f = path.join(out, e.id + '.json');
  fs.writeFileSync(f, JSON.stringify(presetParams(e), null, 2) + '\n');
  console.log(f);
}
for (const [dir, file] of [['materials', materialPresetFile], ['physical', physicalPresetFile]] as const) {
  fs.mkdirSync(path.join(out, dir), { recursive: true });
  for (const e of MATERIAL_PRESETS) {
    const f = path.join(out, dir, e.id + '.json');
    fs.writeFileSync(f, file(e));
    console.log(f);
  }
}
