# E-ink watch concepts

Source ideas: `dialogues.md`. Art: `imgs/` (ChatGPT) and `imgs/gen/<tool>/` (codex image_gen; agy CLI generate_image = Gemini, watch renders good, sidebar text garbled). Cursor `agent` lane hangs headlessly..
Regenerate: `imgs/gen/run.sh <codex|agy> <key>`; prompts in `imgs/gen/prompts.txt`. agy variants: `imgs/gen/agy/<key>.jpg` (missing 9 hit Gemini image quota; rerun after reset).

| Key | Concept | Image | Notes |
|---|---|---|---|
| blob | Inkblot (4) | imgs/blob.png | |
| mask-dots | Dot-mask aperture (7) | imgs/mask.png | |
| depth | Impossible mechanical (12) | imgs/depth.png | |
| dayfall | Accumulating ink (D) | imgs/dayfall.png | |
| blueprint | Blueprint instrument (6) | gen/codex/blueprint.png | prompt says "NO watch hands" |
| ribbons | Two time ribbons (A) | gen/codex/ribbons.png | closest to tube lineage |
| nixie | E-ink Nixie cavities (B) | gen/codex/nixie.png | |
| mask | Machined mask, odd cutouts (E) | gen/codex/mask.png | |
| lastseen | Last-seen watch | gen/codex/lastseen.png | bistable-only concept |
| cuff | Ticker-tape cuff | gen/codex/cuff.png | flexible panel |
| splitflap | Split-flap | gen/codex/splitflap.png | refresh as mechanism |
| typewriter | Typewriter strip | gen/codex/typewriter.png | image shows future lines; treat as ghosting |
| topo | Topographic | gen/codex/topo.png | |
| shadow | Shadow dial + gnomon | gen/codex/shadow.png | |
| hourlyprint | Hourly colour print | gen/codex/hourlyprint.png | Spectra 6 |
| strata | Geological strata | gen/codex/strata.png | |
| prose | Prose face | gen/codex/prose.png | |
| facade | Architectural façade | gen/codex/facade.png | |
| industrial | Binary/industrial panel | gen/codex/industrial.png | |
| seismo | Seismograph strip chart | gen/codex/seismo.png | new; uses IMU without motion display |
| hourglass | E-ink hourglass | gen/codex/hourglass.png | new; two-chamber successor of tubes |
| ledger | Ledger page | gen/codex/ledger.png | new |
| postmark | Rubber-stamp postmark | gen/codex/postmark.png | new; ghosting as previous stamp |

Strongest for the tube lineage: ribbons, hourglass, nixie, mask.
Strongest standalone: seismo, lastseen, cuff, strata.
