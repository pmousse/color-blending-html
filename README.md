# Color Grid

Four colors at the four corners, and the whole image filled with **bilinear interpolation**.
A plain web page: no build, no framework, no dependency — open it and paint.

![Color Grid: a blue Oklch field, 27 x 27 cells, three control points dragging the gradient](intro.jpg)

### → [Try it online](https://pmousse.github.io/color-blending-html/)

## What it does

**The frame**

- 13 formats (square 1:1, desktop 16:9, phone 9:16, ultrawide 21:9, 4:3, 3:4, 3:2, 2:3, 5:4, 4:5,
  2:1, 1:2) plus a **custom size** typed by hand.
- **Density** 1–64: cells along the *short* side, the long side following the ratio with whole
  cells, so cells stay square and the format stays exact.
- Export at an exact **long side**: 1K, 2K, 2.5K, 4K, 4K+.

**The colors**

- 4 corner pickers — or click straight on a corner cell of the preview.
- **6 blending spaces** for the intermediate cells: sRGB, Linear, OkLab, Oklch, HSL, HSV. The
  cylindrical ones unfold the 4 corner hues into one continuous scale first, so no rupture line
  cuts the gradient (the worst neighbouring jump goes from 179° down to about 15°).
- A cell is one flat color: the HEX code read from it is the very color painted in the PNG.

**Control points**

- Click anywhere inside the image to plant a color: up to **16** points, each opening one control
  row and one control column through the frame.
- **Drag its ring** to move it — the gradient bends under the pointer while you drag.
- A point is kept as a **percentage of the image**, so it survives a change of format or of density.
- Corners stay theirs: a control point can never replace one.

**Getting it out**

- **Export PNG** at the exact pixel size asked for, one cell painted per cell, HEX codes painted in
  only if you ask.
- A file name that says what was painted: `colorgrid_blue-desktop_27x27_d27_1x1_oklch_cp3_3840x3840.png`.
- **Copy palette** for the distinct codes, `Shift` + click to copy one cell's code.
- **Copy link** for an address that carries the settings: send it, the page opens exactly as it was
  left.

**Saved presets**

- A name + **Save** and the grid is kept in the browser storage: format, density, resolution,
  blending space, corner colors and control points.
- Saved grids are listed in the panel — click a name to reopen one, `✎` to rename it, `×` to delete
  it. Each line announces what it holds: `12×7 · 16:9`, `5×5 · OkLab · 1 control point`.
- No account, no server, nothing uploaded: the grids stay on the machine, in `localStorage`.
- The page reopens as it was left, showing the grid you were last working on.

The long version — the interpolation, the six spaces, the address keys, the storage, the checks —
sits in [DETAILS.md](DETAILS.md).

## Files

| File | |
|---|---|
| `index.html` | the page |
| `app.js` | settings, frame and density, control points, preview, export, address |
| `colorspaces.js` | the 6 blending spaces, the hue unwrapping, the control point lattice |
| `storage.js` | saved grids in localStorage |
| `styles.css` | everything |
| `DETAILS.md` | the long documentation |
| `.t/` | dev tooling: 220 interface checks, 123 color math checks, a Python reference |

Vanilla HTML, CSS and JavaScript. Works straight from the files (`file://`), no server needed.

## Running the checks

```bash
cd .t && npm install     # jsdom, once
node .t/ui.mjs           # the interface  → 220 passed, 0 failed
node .t/spaces.cjs       # the color math → 123 passed, 0 failed
python .t/ref.py         # parity with an independent Python implementation → identical
```

## Notes assumed

- Colors coming out of a 3D tool are usually stored as **linear** light, while the page works in
  sRGB. Grids made elsewhere are not translated, they start fresh.
- Corner colors and copied codes stay plain sRGB HEX whatever the blending space.
- Control point rings are drawn on the preview only, never in the exported PNG.

## Credits

**This project's code was written by an AI coding agent.** Qwen 3.8 flash (model build
`qwen3.8-flash-next`) working in the [pi](https://github.com/badlogic/pi-mono) coding-agent harness,
at the direction of **pmousse**, who chose the direction, supplied the reference images, judged every
result and owns the project. Worth stating plainly: some of the reasoning here was the agent's, some
of it was the human's, and the division is not neat — the 343 checks under `.t/` are what settled the
arguments.
