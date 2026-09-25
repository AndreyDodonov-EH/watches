# Alternative physical renderer — staged plan (superseded)

Superseded 2026-09-25. The staged plan for a standalone physical renderer (phases 0–1 shipped
2026-09-18 as `sim/physical.html` and `firmware/src/physical/`) was replaced by the material layer in
the main simulator: a liquid is authored as physical material properties and `derive(material, design)`
turns them into the legacy renderer's `Params`. The standalone lab, its firmware renderer and its
serial commands are removed; its optical kernel (cylinder trace, Fresnel, Beer–Lambert, extended
light) lives on in `sim/src/material/optics/`.

See [docs/physical-renderer.md](physical-renderer.md) for the material model, the derivation laws and
the kernel. The original plan text remains in git history (commit d5eeba4).
