# Color Grid — full documentation

The long version of [README.md](README.md): every setting spelled out, the color math, the address
format, the storage keys, the checks carried out.

Color Grid is the browser version of the Blender add-on `color_grid`: you set **4 colors at the
corners**, and the image fills up by **bilinear interpolation**. The frame of the image comes from the
Truchet Studio model: a **format**, a cell **density**, an export **resolution**. Nothing else — no
spacing, no moving, rotating, mirroring or lifting.

## Opening it

- online: <https://pmousse.github.io/color-blending-html/>
- or from the files: double-click `index.html` — no installation, no build
- or served: `python -m http.server` in this folder, then <http://localhost:8000>

## Use

1. **Image format**: square 1:1, desktop 16:9, phone 9:16, ultrawide 21:9, 4:3, 3:4, 3:2, 2:3,
   5:4, 4:5, 2:1, 1:2, or **custom size** (width and height typed by hand).
2. **Density** (1 to 64): the number of cells along the **shortest side** of the frame. The long
   side follows the ratio rounded to a whole number of cells, so cells stay nearly square and the
   image keeps exactly its format.
3. **Blending space**: how the intermediate cells are computed — see
   [Blending space](#blending-space). Default choice: **sRGB**.
4. **Corner colors**: the 4 pickers of the panel, or a click straight on one of the 4 corner
   cells of the preview to open its picker. The preview is rendered as one plain image, with no
   seam and no frame: a thin outline appears only under the mouse (thicker on the 4 corners, the
   only ones that can be edited).
5. The intermediate cells are recomputed live.
6. **Control points**: with **Click places a control point** ticked (the default), a click on a cell
   that is not a corner plants a control point on it, and its color is picked right away. Unticked,
   a click **copies the HEX code** of the cell. `Shift` + click does the opposite of the tick, in
   both cases. See [Control points](#control-points).
7. **Copy palette** copies the distinct codes, separated by commas.
8. **Show HEX codes**: cell by cell on the preview (hidden automatically when the cells become
   too small, below roughly 52 px of width).
9. **My grid**: a name + **Save** → the grid is stored in the browser, format, density,
   resolution, blending space and control points included.
10. **Saved grids**: clicking a name reloads it, `✎` renames it, `×` deletes it. Each line
    announces its lattice (for instance `12×7 · 16:9`, `5×5 · OkLab · 1 control point`).
11. **Export PNG**: a **long side** (1K, 2K, 2.5K, 4K, 4K+) and **Export PNG**. The box
    "HEX codes in the image" is independent from what is shown on screen.
12. **Grid address**: the settings are written in the address continuously, and **Copy link**
    copies the whole address — a page opened on that address takes those settings back. See
    [Grid address](#grid-address).

## The frame: format, density, resolution

- The **long side** of the exported image is the chosen resolution; the short side follows from
  the ratio (`16:9` in 2K → `2048 × 1152 px`, never `2048 × 2048`).
- In a **custom size**, the dimensions typed are used as they are (capped at 8192 px): the chosen
  resolution no longer applies, its selector is disabled.
- An information line always sums the situation up: `2048 × 1152 px · 9 × 5 cells ·
  desktop 16:9 · cell ≈ 227.6 px in the export`.
- **Cell budget**: 8192 cells at most, in the preview as in the export. A very long frame
  therefore caps the density (`21:9` accepts 59 at most → `138 × 59`). The grid summary says so:
  `density capped at 59`.
- An overlarge custom ratio is reduced to an integer ratio whose sides never exceed 512
  (`8192 × 16` → `512:1`). The image keeps its exact size, the cells adjust.
- The preview is **the very same lattice** as the exported image, shrunk to fit the window:
  nothing is cropped, what you see is what you export.

## Control points

The 4 corners are not the only colors one can impose. A **control point** is a color placed anywhere
inside the frame: it opens one control row and one control column through the image, and every patch
between two neighbouring nodes is interpolated as before. The corners stay untouched — a control
point can never replace one of them.

- **Planting one**: click a cell (with *Click places a control point* ticked). The point stands on
  the very spot that cell is sampled at, so the cell clicked takes the color asked for exactly, and
  the neighbouring cells follow it.
- **Several**: 16 at most per grid. Clicking twice the same cell updates the point instead of
  duplicating it.
- **Position**: a point is kept as a percentage of the image — `x` from the left edge, `y` from the
  top edge — and both fields of its row are editable. A point therefore **survives a change of
  format or of density**: it stays where it stands in the image, it is not tied to a cell number.
- **Its row in the panel**: color picker, `x %`, `y %`, the HEX code read back, `×` to remove it.
- **Moving one**: press its ring and drag it — the gradient bends under it while one moves, and the
  color is dropped where the pointer is released. The ring follows the pointer while a point is kept
  in the coordinates the cells are sampled with: that is the reverse of where the ring is painted, and
  the two map back onto each other exactly. A ring dropped onto a corner is refused, the point goes
  back where it was taken. Dragging needs the marks (*Mark control points*): the rings being the only
  handle one can see, a hidden point is not grabbable — its row in the panel stays there instead.
- **Marks**: a ring around each point, with a thin dashed cross showing the row and the column it
  opens. On the preview only — *Mark control points* ticks them, and they never go into the exported
  PNG. A ring sits on the cell that carries the color, not on the seam between two cells.
- **A gray, black or white point** forces no hue into the gradient: in Oklch, HSL and HSV it borrows
  the hue of the field around it.
- **What changes in the math**: the interpolation is no longer one single bilinear pass over the
  whole image, but one pass per patch of the lattice. With no control point the lattice holds only
  the 4 corners, and the result is exactly the plain grid.
- **Density 1**: the only cell stands on the corners, so there is nowhere inside the frame to plant
  a point — the page says so rather than overwriting a corner.

## Export PNG

The canvas is exactly the size asked for — 1K = 1024 px on the long side, not an enlargement of
the preview. The file name accounts for what went into making the image:

```
colorgrid_link-test_23x13_d13_16x9_oklch_cp2_hex_2048x1152.png
        └── name ─┘└lattice┘ │ └ratio┘└─space──┘└pt┘│   └──── size ────┘
                        density kept        points  codes painted in the image
```

- **lattice**: the cells actually painted (`23 × 13`), after any ceiling — not the density asked
  for;
- **density**: the one applied along the short side;
- **format**: the ratio of the chosen format. In a **custom size** this part is absent, its
  dimensions already are the final size — writing them twice would add nothing;
- **blending space**;
- **control points**: `cp2` when the grid carries points, absent when it carries none;
- **`hex`** only appears when codes are painted into the image;
- **size**: pixels of the file.

The file name meant is announced under the export button **before** you use it, not only after.
A crooked grid name (`// ..`) does not build a sub-folder: it is simply left out.

The HEX codes painted into the image follow their own setting: ticked, they are written into the
PNG with a font fitted to the cell size; unticked, the PNG is a plain plate of colors. The box
"Show HEX codes" of the preview changes nothing there.

## Grid address

As in Truchet Studio, the settings live in the address, in its fragment:

```
index.html#F=16x9&fw=16&fh=9&n=13&rs=2048&sp=oklch&nm=Link%20Test&hx=1&ex=1
         &c1=ff0000&c2=00ff00&c3=0000ff&c4=ffff00
```

| key | setting | example |
|---|---|---|
| `F` | format, the colons written `x` | `1x1`, `16x9`, `custom` |
| `fw`, `fh` | width and height of the custom size | `1920`, `1080` |
| `n` | density | `13` |
| `rs` | long side, in pixels | `2048` |
| `sp` | blending space | `oklab`, `oklch`, `hsl`… |
| `nm` | grid name | `Link%20Test` |
| `hx` | codes shown on screen | `1` / `0` |
| `ex` | codes painted into the PNG | `1` / `0` |
| `pm` | a click plants a control point | `1` / `0` |
| `mk` | rings and crosses shown | `1` / `0` |
| `P` | control points | `50x50_00ff00*12x80_ff8800` |
| `c1` `c2` `c3` `c4` | the 4 corners, without `#` | `ff0000` |

- **Written at every setting change, read again on opening**: a link shared, pasted into another
  browser or bookmarked reopens the grid as it was, with its file name. The panel shows the
  address under the **Copy link** button.
- **The fragment rather than the query** (`?F=16`), for the same reasons as in Truchet: it
  triggers no reload, and it works in `file://`. The query `?F=4x3` stays accepted when reading,
  for an address pasted written that way.
- **Opening order**: address received, otherwise last grid shown, otherwise default values. A
  shared address therefore comes before what the browser had kept.
- **A missing key keeps its default value** (`#n=9` only changes the density); a nonsensical key
  falls back on the default, just like a damaged record: density `abc`, color `zzzz`, space
  `nope`, `hx=not really` — the page starts, everything is brought back to the defaults. A value
  one does not recognize is not a "no": it leaves the setting as it was.
- **Two writing precautions**: HEX codes without `#` (a `#` lost in the middle of the address
  would cut off what follows), and the `:` of formats written `x` (`16x9`) for a readable link.
  Spaces become `%20` and not `+`, so a space of a name is not confused with a `+` typed by hand.
- **Control points in one key**: `50x50_00ff00` reads "x = 50 %, y = 50 %, color `#00ff00`", and
  several points are separated by `*`. Only `*` and `_` survive an address untouched — `,` and `;`
  would be rewritten by the browser and make the link unreadable. An **empty `P=`** asks for no
  control point at all, while a `P` key simply absent leaves the points as they were.
- The fragment is **replaced** without adding a history entry when the browser accepts it; in
  `file://`, where `history.replaceState` is refused, it is written normally — the fallback is in
  place, nothing complains.
- An address does not create a record: it opens a grid, it does not store it. To keep it in the
  list, **Save**.

## Interpolating the colors

For the cell `(col, row)`, rows counted from the top:

$$c_{col,row}=(1-y)\left[(1-x)c_{BL}+x\,c_{BR}\right]+y\left[(1-x)c_{TL}+x\,c_{TR}\right]$$

with $x=\frac{col}{cols-1}$ and $y=1-\frac{row}{rows-1}$. A formula identical to the add-on's
(parity checked cell by cell against a reference Python implementation). `cols` and `rows` come
from the format and the density: `16:9` at density 5 gives `cols = 9`, `rows = 5`. With
`cols == 1` or `rows == 1`, `x` or `y` is 0, as in the add-on — a grid at density 1 therefore
takes the color of the **bottom left** corner.

## Blending space

The formula above applies to numbers: depending on the unit the colors are placed in, the same
pair of corners does not give the same gradient. The **Blending space** selector chooses that
unit. The 4 corners, on their side, stay HEX codes of sRGB: what you pick at the color picker,
what you copy and what you store do not depend on the space.

The middle of an edge, with `#FF0000` / `#00FF00` on top and `#0000FF` / `#FFFF00` at the bottom:

| Space | red ↔ green | blue ↔ yellow | centre of the grid | looks |
|---|---|---|---|---|
| **sRGB** *(default)* | `#808000` | `#808080` | `#808040` | half-mix of the codes, dull in the middle |
| **Linear light** | `#BCBC00` | `#BCBCBC` | `#BCBC89` | like a 3D engine: bright but desaturated |
| **OkLab** | `#D0A800` | `#6CABC7` | `#A2AD86` | perceived lightness kept constant, soft transitions |
| **OkLch (hue)** | `#F99500` | `#FF3185` | `#FF5200` | turns around the color circle, very vivid |
| **HSL (hue)** | `#FFFF00` | `#FF0080` | `#FF4000` | goes through the intermediate hue, saturated |
| **HSV (hue)** | `#FFFF00` | `#FF0080` | `#FF4000` | same as HSL, mixing value rather than lightness |

On the spaces that carry a hue, the two other edges are worth `#BA00C2` / `#FF00FF` for
red ↔ blue (through magenta) and `#B9FF00` / `#80FF00` for green ↔ yellow.

The choice is stored with the grid (`space`); a grid that does not mention it is in sRGB. An
unknown space in the storage falls back on the default, without blocking the opening.

A few rules applied so the result stays predictable:

- **the 4 corners never move**, in every space: the mix is built so that $x=0$ or $1$ and
  $y=0$ or $1$ give back exactly the corner color (verified);
- **the interpolation runs entirely in the chosen space**: the corners are converted there once,
  then the result comes back to sRGB — no round trip at every cell;
- **hues**: the hue is a circular coordinate, and it is what makes the mix delicate. Following
  the "shortest path" at *every* step of the bilinear pass makes the result depend on the path
  taken: the hue field starts jumping by nearly 180° between two neighbouring cells as soon as
  the 4 corners make the tour of the circle — a rupture line plainly visible on the image. A
  continuous hue field cannot take the shortest path on all four edges at once: that is a
  property of the circle, not a choice.

  Therefore **the hues of the 4 corners are unfolded once into a continuous scale** (each one
  brought back within 360°), and then the whole interpolation stays within those numbers, with no
  return to the circle along the way. The unwrap kept is the cheapest one — the fewest degrees
  travelled in total along the 4 edges — and it is deterministic, so a stored grid gives the same
  image back. Assumed compromise: one edge can take the long way round (with the colors above,
  blue ↔ yellow goes through pink and orange); in exchange there is no discontinuity left, and
  the edges red ↔ green (through yellow) and red ↔ blue (through magenta) keep their intuitive
  path.

  A gray, black or white corner has no hue: it borrows the mean hue of the other corners,
  instead of forcing red;
- **out of gamut**: some mixes (OkLab, OkLch, hues) produce colors a screen cannot display; the
  components are creamed off into the 0–1 interval. A gradient can therefore "saturate" for a
  moment along a row.

For OkLab and OkLch, the forward matrices are the ones published by Björn Ottosson (the ones CSS
gives for `#FF0000`: `oklab(62.796% 0.22486 0.12585)`), but **the return matrices are computed
from them**: the published forward and backward constants are not inverses of each other, and the
gap — tiny in linear light — becomes visible near black (`#FF0000` would become `#FF0012`).

## A note on color (color space)

A triplet `[r, g, b]` only makes sense with the rules linking that number to the perceived hue:
that is the **color space**. Blender stores color properties as **linear light**, the browser
expects **sRGB** (a gamma-coded value, like the screen). The two do not match: a medium sRGB gray
`0.5` corresponds to `0.214` in linear.

The triplets stored by this page are sRGB, an exact round trip: the code shown, the code copied,
the triplet written into the storage and the pixel of the PNG are the same value — whatever the
blending space chosen, which only changes the intermediate cells. That is what led to **starting
over from scratch** rather than taking back the grids stored by the previous version: they carried
`cols × rows`, and their floats took the Blender JSONs directly, mixed in sRGB with no conversion
from linear light. The old values were therefore darker and more saturated than in the Blender
viewport — and readable no longer with the current model anyway.

## Persistence: localStorage

Instead of the `grids/*.json` files of the add-on, the grids live in the browser `localStorage`
(keys prefixed `color_grid.`, to leave room for other applications on the same origin):

| Key | Content |
|---|---|
| `color_grid.grids.v2` | object `{ name: configuration }`, the list of stored grids |
| `color_grid.current.v2` | last grid shown: the page reopens as it was left |

On loading, the keys of the previous versions (`color_grid.grids.v1`, `color_grid.current.v1`,
`color_grid.seeded.v1`, and the loose keys `color_grid.name`, `color_grid.cols`,
`color_grid.rows`, `color_grid.space`, `color_grid.showHex`) are **wiped**: the old
`cols × rows` model has no faithful equivalent in the new one, it was deleted rather than
converted.

One configuration:

```json
{
  "grid_name": "Desk OkLab",
  "format": "16:9",
  "density": 7,
  "frame_w": 16,
  "frame_h": 9,
  "res": 2048,
  "space": "oklab",
  "color_top_left": [1, 0, 0],
  "color_top_right": [0, 0, 1],
  "color_bottom_left": [0, 1, 0],
  "color_bottom_right": [1, 1, 0]
}
```

`format` is one of the keys of the selector (`"1:1"` … `"1:2"`, `"custom"`); a value not
recognized falls back on `"1:1"`. `density` is bounded to 1–64 then capped by the cell budget.
`frame_w` / `frame_h` only serve the custom size. `space` is one of `srgb`, `linear`, `oklab`,
`oklch`, `hsl`, `hsv`; missing or not recognized → `srgb`.

**Wiping all memory**: browser console →
`Object.keys(localStorage).filter(k => k.startsWith("color_grid.")).forEach(k => localStorage.removeItem(k))`
then reload: the list is empty, the default grid comes back.

**Storage unavailable** (private browsing, `file://` in some browsers, quota full): the
application switches to a volatile memory, shows a warning and keeps working — the grids are
simply lost when the page closes.

## Files

```
index.html       page structure
styles.css       dark panel, preview stage, grid list
storage.js       GridStore: localStorage v2, wiping the inherited keys, memory fallback
colorspaces.js   the 6 blending spaces, the hue unwrapping, the control point lattice, the interpolation ramp
app.js           frame (format, density, resolution), colors, interpolation, canvas rendering, PNG export
.t/              test harness (jsdom + Python reference), a development tool only
```

## Differences assumed with the Blender add-on

| Blender add-on | Web version |
|---|---|
| 3D mesh, color per corner, emission material | one flat image, cells painted on a canvas |
| free `cols` × `rows`, `spacing` between tiles | format + density + resolution, joined cells with no spacing |
| `tiles` collection, several grids in the scene | one grid shown at a time |
| move / mirror / rotate / lift / delete a tile | absent |
| JSON files in a folder of the add-on | localStorage, with a PNG export instead of a 3D render |
| color per face corner (`CORNER`), cell painted with one flat color | a cell of a single color, corners editable |
| one single color space (Blender floats) | six blending spaces to choose from, per grid |
| settings in the add-on properties | settings also in the address: a link shares the grid |

## Checks carried out

- Interpolation parity: the default 5×5 grid gives exactly the same HEX codes as a reference
  Python implementation.
- Frame: `1:1` density 5 → `5×5`; `16:9` density 5 → `9×5` exported `2048 × 1152 px`;
  `9:16` → `5×9` in `1152 × 2048`; `4:5` → `5×6`; `21:9` density 64 capped at `59` →
  `138×59`; custom size kept as it is (`1920 × 1080`), ratio brought back to `512:1` where
  needed, a budget of 8192 cells never exceeded.
- Export: complete file name, one cell painted per cell, codes painted only when asked, blending
  space reported in the name.
- Address: written at every setting change (format, custom dimensions, density, resolution,
  space, name, codes shown and painted, the 4 colors), read again on opening — including from a
  link pasted with `?` —, read back identically once rewritten, priority over the last grid
  opened, partial address (one key = one setting, the rest on the defaults), nonsensical address
  (density `abc`, color `zzzz`, space `nope`, `hx=notreally`) brought back to the defaults with
  no error, custom size restored (`1920 × 1080`, file name with no doubled ratio).
- Clicks on the preview: the 4 corners open their picker; a middle cell plants a control point and
  `Shift` + click copies its code — or the reverse with *Click places a control point* unticked; at
  density 1 no corner is editable and no point can be planted.
- Control points: the cell clicked takes the color asked for exactly and the neighbours follow it;
  the 4 corners stay intact inside the lattice and no point replaces one of them; the ring sits on the
  cell clicked; a point keeps its place through a change of format or of density; typed positions
  (`x %`, `y %`) are obeyed and an empty field changes nothing; 16 at most; a point planted on a corner
  is refused; damaged points (no position, no color, `NaN`) are dropped; a gray point borrows the hue
  of the field around it and still imposes its gray.
- Dragging a ring: ring centre and sampling position cancel each other out (putting a ring with
  `markSpot` then reading it back with `sampleOf` gives the very same position); grabbing a ring moves
  the point, the panel rows follow it, and the click a drag produces plants no second point; a ring
  dropped on a corner goes back where it was; a pointer released outside the preview still drops the
  point and leaves no click waiting; without marks nothing is grabbable and a click stays a click; the
  cursor turns `grab` over a ring and no cell outline follows the pointer during a drag. Checked in
  jsdom and in Chrome, mouse events synthesized on a real preview box.
- Codes hidden automatically when the cells become too small, said in the summary.
- Saving / reloading over two pages sharing the same storage: format, density, resolution, space
  and lattice found back.
- Starting with storage missing, blocked, corrupted, inherited from version 1, or holding values
  out of bounds (`density: -2`, `format: "??"`, color `2.0` / `-1.0` / `"z"`): the page starts,
  corrects, and wipes the inherited keys.
- File name: the lattice actually painted, the density kept after the ceiling, the format, the
  space, the codes painted, the final size; announced before the export; no path separator even
  with a crooked grid name.
- Blending spaces: the 4 corners come out intact in the 6 spaces (including black, white, gray,
  out-of-gamut colors); an unknown space returns to the default; the space survives a reload;
  the sRGB default stays true to the Python reference; a non-standard space does show up in the
  grid list.
- Hue field: the largest gap between two neighbouring cells stays under 25° in OkLch, HSL and
  HSV (it reached 179° before the unwrapping); the unwrap kept is compared against the 81
  unwraps possible and recognised as the cheapest; a gray corner does not force its hue;
  red ↔ green and red ↔ blue keep the intuitive path.
- Hue field around a control point: sampled four times finer the gap shrinks just as much (OkLch:
  42.4° at 21 samples → 22.8° at 43 → 11.4° at 87) — a continuous gradient, only steeper where a
  point imposes a color the plain gradient did not have. A rupture line would keep the very same gap
  whatever the sampling.
- Carried out by `.t/ui.mjs` (the interface, 220 checks) and `.t/spaces.cjs` (the color math, 123
  checks), plus `.t/ref.py` for the parity with the add-on formula.
