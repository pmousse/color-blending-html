"use strict";

/* ==========================================================================
   app.js — Color Grid (web version)
   4 corner colors + bilinear interpolation. The image frame: a format (square,
   16:9, phone...), a cell density and a PNG export resolution. The preview is
   drawn on a canvas, on the very lattice the exported image uses.
   ========================================================================== */

const MAX_NAME = 60;

/* Formats (ratios reduced, always positive). */
const FORMATS = {
  "1:1": [1, 1, "square 1:1 — social media"],
  "16:9": [16, 9, "desktop 16:9"],
  "9:16": [9, 16, "phone 9:16"],
  "21:9": [21, 9, "ultrawide 21:9"],
  "4:3": [4, 3, "landscape 4:3"],
  "3:4": [3, 4, "portrait 3:4"],
  "3:2": [3, 2, "landscape 3:2"],
  "2:3": [2, 3, "portrait 2:3"],
  "5:4": [5, 4, "landscape 5:4"],
  "4:5": [4, 5, "portrait 4:5"],
  "2:1": [2, 1, "double wide 2:1"],
  "1:2": [1, 2, "double tall 1:2"],
  custom: [0, 0, "custom size…"],
};
const FORMAT_ORDER = [
  "1:1", "16:9", "9:16", "21:9", "4:3", "3:4", "3:2", "2:3",
  "5:4", "4:5", "2:1", "1:2", "custom",
];

const RESOLUTIONS = [
  [1024, "1K (1024 px)"],
  [2048, "2K (2048 px)"],
  [2560, "2.5K (2560 px)"],
  [3840, "4K (3840 px)"],
  [4096, "4K+ (4096 px)"],
];

/* Density = number of cells along the short side of the frame.
   MAX_CELLS is the budget of cells actually painted, in the preview as in the
   export: it caps the density for very long frames (21:9 at density 64 would
   ask for 138 x 59 = 8142 cells). */
const DENSITY_CAP = 64;
const MAX_CELLS = 8192;
const RATIO_CAP = 512;         // max side of a reduced ratio (custom size)
const FRAME_MIN = 1;          // hand-typed dimensions: at least 1 pixel
const FRAME_MAX = 8192;
const MAX_POINTS = 16;        // control points one may impose inside the frame

const state = {
  format: "1:1",
  frameW: 16,
  frameH: 9,
  density: 5,
  res: 2048,
  name: "My Grid",
  showHex: true,
  exportHex: false,
  pickMode: true,             // a click on a cell places a control point
  markPoints: true,           // rings drawn on the preview, never in the PNG
  space: ColorSpaces.DEFAULT_SPACE,
  /* control points: { x, y, color } — x as a fraction of the width from the
     left, y as a fraction of the height from the TOP edge: never a cell number,
     so density and format changes do not move them */
  points: [],
  colors: {
    topLeft: "#ff0000",
    topRight: "#00ff00",
    bottomLeft: "#0000ff",
    bottomRight: "#ffff00",
  },
};

const $ = (id) => document.getElementById(id);
const el = {
  format: $("format"), rowCustom: $("rowCustom"), fmtW: $("fmtW"), fmtH: $("fmtH"),
  density: $("density"), frameInfo: $("frame-info"),
  space: $("space"), spaceHint: $("space-hint"),
  frame: $("frame"), grid: $("grid"), summary: $("summary"), picked: $("picked"),
  gridList: $("grid-list"), storageNote: $("storage-note"),
  save: $("save"), regen: $("regen"), copyPalette: $("copy-palette"),
  name: $("grid-name"),
  showHex: $("show-hex"), exportHex: $("export-hex"),
  res: $("res"), exportBtn: $("export"), exportInfo: $("export-info"),
  copyLink: $("copy-link"), linkInfo: $("link-info"),
  pickMode: $("pick-mode"), markPoints: $("mark-points"),
  pointList: $("point-list"), pointInfo: $("point-info"),
  toast: $("toast"),
  pickers: {
    topLeft: $("c-top-left"), topRight: $("c-top-right"),
    bottomLeft: $("c-bottom-left"), bottomRight: $("c-bottom-right"),
  },
};

/* ------------------------------ colors ------------------------------ */

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/* a component that is not a number (a damaged record) becomes 0 */
const num01 = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? clamp01(n) : 0;
};

function hexToRgb(hex) {
  let h = String(hex).replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const rgbToHex = (rgb) =>
  "#" + rgb.map((c) => {
    const n = Number(c);
    return (Number.isFinite(n) ? Math.round(clamp01(n) * 255) : 0).toString(16).padStart(2, "0");
  }).join("");

/* Stored colors are handled directly as sRGB 0..1: see DETAILS.md, the note on the
   linear values a 3D tool exports. */
const arrayToHex = (a) => rgbToHex([num01(a[0]), num01(a[1]), num01(a[2])]);

/* Bilinear interpolation:
   c = (1-y)((1-x)BL + x BR) + y((1-x)TL + x TR)
   The blend runs in the chosen space (ColorSpaces), sRGB by default. */
const CS = ColorSpaces;

/* --------------------------- control points ---------------------------

   A control point is a color the user imposes inside the frame. Its position is
   a fraction of the width and of the height, never a cell number: changing the
   density, the format or the resolution moves the cells, not the point — a point
   set at 50% × 50% stays the middle of the image at density 5 as well as at
   density 40, in 1:1 as well as in 16:9.

   Throughout the application y is counted from the TOP edge, the way the grid is
   shown and read; the ramp wants y counted from the bottom edge: the conversion
   happens once, in rampPoints(). */

/* 0.5 -> 50, 0.0385 -> 3.85: the position as one reads it in the panel */
const pointToPercent = (v) => Math.round(v * 10000) / 100;
const percentToPoint = (v) => clamp01(Number(v) / 100);

const roundedPoint = (v) => Math.round(clamp01(v) * 1e6) / 1e6;

/* positions in the ramp convention (y from the bottom) */
function rampPoints() {
  return state.points.map((p) => ({ x: p.x, y: 1 - p.y, color: p.color }));
}

function pointsSignature() {
  return state.points.map((p) => `${p.x}|${p.y}|${p.color}`).join(";");
}

/* A damaged list (a storage record, a hand-written address) is corrected or left
   out, never trusted: a point without a usable position or color disappears. */
function sanitizePointList(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const p of value) {
    if (!p || !Array.isArray(p.color) || p.color.length !== 3) continue;
    const x = Number(p.x);
    const y = Number(p.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    out.push({ x: roundedPoint(x), y: roundedPoint(y), color: arrayToHex(p.color) });
    if (out.length >= MAX_POINTS) break;
  }
  return out;
}

let rampCache = null;
let rampKey = "";

/* The ramp converts the 4 corners once, not once per cell. */
function currentRamp() {
  const key = [
    state.space,
    state.colors.topLeft, state.colors.topRight,
    state.colors.bottomLeft, state.colors.bottomRight,
    pointsSignature(),
  ].join("|");
  if (key !== rampKey) {
    rampCache = CS.makeRamp(state.space, state.colors, rampPoints());
    rampKey = key;
  }
  return rampCache;
}

/* x = col/(cols-1), y = 1 - row/(rows-1), rows counted from the top.
   cols == 1 or rows == 1 => x or y stays 0. */
function cellColor(col, row, cols, rows) {
  const x = cols > 1 ? col / (cols - 1) : 0;
  const y = rows > 1 ? 1 - row / (rows - 1) : 0;
  return currentRamp()(x, y);
}

/* Black or white ink: we keep the stronger contrast (WCAG), which avoids white
   on mid gray and black on saturated green. */
function inkColor(rgb) {
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const L = 0.2126 * lin(rgb[0]) + 0.7157 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
  const contrastBlack = (L + 0.05) / 0.05;
  const contrastWhite = 1.05 / (L + 0.05);
  return contrastBlack >= contrastWhite ? "#111111" : "#f5f5f5";
}

/* --------------------------- frame and lattice --------------------------- */

function gcd(a, b) {
  while (b) { const t = b; b = a % b; a = t; }
  return a;
}

/* Brings any ratio down to two integers no larger than RATIO_CAP: exact integer
   division when possible (14:8 -> 7:4), otherwise the best continued-fraction
   approximation (1920x1080 -> 16:9). Also looks among the known formats, so a
   custom size finds back the name of the format it imitates. */
function approxRatio(w, h, known) {
  const a = Math.max(1, Math.round(w));
  const b = Math.max(1, Math.round(h));
  const g = gcd(a, b);
  let p = a / g, q = b / g;

  if (Math.max(p, q) > RATIO_CAP) {
    const x = a / b;
    let bestP = 1, bestQ = 1, bestErr = Infinity;
    for (let d = 1; d <= RATIO_CAP; d++) {
      const n = Math.min(RATIO_CAP, Math.max(1, Math.round(x * d)));
      const err = Math.abs(x - n / d) / x;
      if (err < bestErr - 1e-12) { bestErr = err; bestP = n; bestQ = d; }
    }
    p = bestP; q = bestQ;
  }

  if (known) {
    for (const [key, [kp, kq]] of Object.entries(FORMATS)) {
      if (!kp || key === "custom") continue;
      if (p * kq === q * kp) return [kp, kq, key];
    }
  }
  const g2 = gcd(p, q);
  return [p / g2, q / g2, null];
}

function frameRatio() {
  if (state.format === "custom") return approxRatio(state.frameW, state.frameH, true);
  const [p, q] = FORMATS[state.format] || FORMATS["1:1"];
  return [p, q, state.format];
}

const isCustomSize = () => state.format === "custom";

/* Pixel size of the exported image (and the preview ratio):
   - known format: the long side is the chosen resolution, the short side follows
     from it, so 1K / 2K / 4K always name the long side;
   - custom size: the typed dimensions, creamed off. */
function exportPx() {
  if (isCustomSize()) {
    return [
      Math.min(FRAME_MAX, Math.max(FRAME_MIN, Math.round(state.frameW))),
      Math.min(FRAME_MAX, Math.max(FRAME_MIN, Math.round(state.frameH))),
    ];
  }
  const [p, q] = frameRatio();
  const res = Math.min(FRAME_MAX, Math.max(64, Math.round(state.res)));
  return p >= q
    ? [res, Math.max(1, Math.round(res * q / p))]
    : [Math.max(1, Math.round(res * p / q)), res];
}

/* Highest density this format can take, cell budget included. */
function densityLimit(p, q) {
  const short = Math.min(p, q), long = Math.max(p, q);
  return Math.max(1, Math.min(DENSITY_CAP, Math.floor(Math.sqrt(MAX_CELLS * short / long))));
}

/* Actual cells: the density applies to the short side, the long side follows the
   ratio rounded to a whole number of cells. Cells therefore stay nearly square,
   and the image keeps exactly its format. */
function dims() {
  const [p, q] = frameRatio();
  const limit = densityLimit(p, q);
  const density = Math.max(1, Math.min(state.density, limit));
  let cols, rows;
  if (p >= q) { rows = density; cols = Math.max(1, Math.round(density * p / q)); }
  else { cols = density; rows = Math.max(1, Math.round(density * q / p)); }
  return { cols, rows, density, limit, clamped: density < state.density, p, q };
}

const distinctCorners = () => {
  const { cols, rows } = dims();
  return cols > 1 && rows > 1;
};

/* ------------------------- cells and colors ------------------------- */

let cellsCache = null;
let cellsKey = "";

/* One single color matrix, used by the preview and by the export: both see
   exactly the same image. */
function cellMatrix() {
  const { cols, rows } = dims();
  const key = [
    state.space, cols, rows,
    state.colors.topLeft, state.colors.topRight,
    state.colors.bottomLeft, state.colors.bottomRight,
    pointsSignature(),
  ].join("|");
  if (key !== cellsKey) {
    const grid = [];
    for (let row = 0; row < rows; row++) {
      const line = [];
      for (let col = 0; col < cols; col++) {
        line.push(rgbToHex(cellColor(col, row, cols, rows)));
      }
      grid.push(line);
    }
    const flat = grid.flat();
    cellsCache = { grid, palette: flat, unique: new Set(flat) };
    cellsKey = key;
  }
  return cellsCache;
}

const CORNER_LABELS = {
  topLeft: "Top left", topRight: "Top right",
  bottomLeft: "Bottom left", bottomRight: "Bottom right",
};
const labelForCorner = (corner) => CORNER_LABELS[corner] || corner;

/* The corner touch point of the preview: (0,0) top left, and so on. */
function cornerAt(col, row) {
  const { cols, rows } = dims();
  if (!distinctCorners()) return null;
  if (row === 0 && col === 0) return "topLeft";
  if (row === 0 && col === cols - 1) return "topRight";
  if (row === rows - 1 && col === 0) return "bottomLeft";
  if (row === rows - 1 && col === cols - 1) return "bottomRight";
  return null;
}

/* Where a cell of the grid stands, as a fraction of the frame — the very same
   coordinates the cells are sampled with (x = col/(cols-1), y from the top).
   A control point placed by a click therefore lands exactly where the color was
   read: adding one changes nothing visible until its color is picked. */
function pointPositionAt(col, row) {
  const { cols, rows } = dims();
  return {
    x: roundedPoint(cols > 1 ? col / (cols - 1) : 0),
    y: roundedPoint(rows > 1 ? row / (rows - 1) : 0),
  };
}

/* The four corners of the frame stay the property of the four pickers: a point
   cannot be set on one of them (with a single row or column, every cell of that
   row shares a corner position). */
function atCornerPosition(pos, cols, rows) {
  const onXCorner = cols > 1 ? pos.x === 0 || pos.x === 1 : true;
  const onYCorner = rows > 1 ? pos.y === 0 || pos.y === 1 : true;
  return onXCorner && onYCorner;
}

/* Two points set on the same cell make one single point: clicking twice on the
   same spot updates the point instead of piling duplicates up. */
const nearPoint = (a, b) => Math.abs(a.x - b.x) <= 1e-4 && Math.abs(a.y - b.y) <= 1e-4;

/* index of the control point standing on that cell, -1 when there is none */
function pointIndexAt(col, row) {
  const at = pointPositionAt(col, row);
  return state.points.findIndex((p) => nearPoint(p, at));
}

/* ------------------------------ rendering ------------------------------ */

const dprOf = () => (window.devicePixelRatio || 1);
/* null when the browser cannot draw in 2D (some environments throw an exception
   instead of answering empty): the preview stays empty, while the settings, the
   summary line and the grid list keep working. */
const ctxOf = (canvas) => {
  try { return (canvas.getContext && canvas.getContext("2d")) || null; } catch (error) { return null; }
};

/* The preview is the export frame, shrunk to fit the stage: same lattice, same
   format, nothing cropped. */
function previewSize() {
  const [W, H] = exportPx();
  const ar = W / H;
  const availW = Math.max(60, el.frame.clientWidth || 600);
  const availH = Math.max(60, el.frame.clientHeight || 420);
  let cw = Math.min(availW, availH * ar);
  let ch = cw / ar;
  if (ch > availH) { ch = availH; cw = ch * ar; }
  return [Math.max(1, Math.floor(cw)), Math.max(1, Math.floor(ch))];
}

/* HEX codes do not fit in cells that are too small: below ~52 px of width the
   color is left alone. The font follows the cell size, capped lower in the
   preview (15 px) than in the exported image. */
const MIN_CELL_FOR_LABEL = 52;

function labelFont(cellW, cellH, max) {
  const cap = Number(max) > 0 ? Number(max) : 15;
  return Math.round(Math.min(cap, Math.max(9, Math.min(cellW, cellH) * 0.18)));
}

function labelsAllowed(cellW, cols) {
  if (cellW > 0) return cellW >= MIN_CELL_FOR_LABEL;
  return cols <= 12;          // no measurement available (test harness)
}

/* Draws the lattice into a canvas of w x h units, `scale` being the number of
   real units per unit (screen dpr for the preview, 1 for the export).
   `labels`: codes painted. Cell borders are rounded to the pixel, and a cell too
   thin keeps at least 1 unit: the image cannot have a hole in it. */
function paintGrid(ctx, w, h, labels, scale, labelMax) {
  if (!ctx) return;
  const { cols, rows } = dims();
  const { grid } = cellMatrix();
  const dpr = Number(scale) > 0 ? Number(scale) : dprOf();

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  for (let row = 0; row < rows; row++) {
    let y0 = Math.round(row * h / rows);
    let y1 = row === rows - 1 ? h : Math.round((row + 1) * h / rows);
    if (y1 <= y0) y1 = y0 + 1;
    for (let col = 0; col < cols; col++) {
      let x0 = Math.round(col * w / cols);
      let x1 = col === cols - 1 ? w : Math.round((col + 1) * w / cols);
      if (x1 <= x0) x1 = x0 + 1;
      ctx.fillStyle = grid[row][col];
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
  }

  if (labels) paintLabels(ctx, w, h, cols, rows, grid, labelMax);
}

function paintLabels(ctx, w, h, cols, rows, grid, labelMax) {
  const cellW = w / cols, cellH = h / rows;
  const size = labelFont(cellW, cellH, labelMax);
  ctx.font = `${size}px system-ui, "Segoe UI", Roboto, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const hex = grid[row][col];
      ctx.fillStyle = inkColor(hexToRgb(hex));
      ctx.fillText(hex.toUpperCase(), (col + 0.5) * cellW, (row + 0.5) * cellH);
    }
  }
}

let hover = null;         // { col, row } under the cursor

/* Hover marker drawn inside the cell, so it never spills onto the neighbour:
   thicker on the 4 corners, the only ones that can be edited. */
function drawHover(w, h) {
  if (!hover) return;
  const ctx = ctxOf(el.grid);
  if (!ctx) return;
  const { cols, rows } = dims();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const dpr = dprOf();
  const corner = cornerAt(hover.col, hover.row);
  ctx.lineWidth = (corner ? 3 : 2) * dpr;
  ctx.strokeStyle = corner ? "#ffffff" : "rgba(255,255,255,.75)";
  ctx.strokeRect(
    hover.col * w * dpr / cols, hover.row * h * dpr / rows,
    w * dpr / cols, h * dpr / rows
  );
}

/* Control point marks: rings on the preview only, never in the exported PNG.
   The thin dashed cross reminds what each point does: it opens one control row
   and one control column through the image — the lattice is invisible otherwise.

   A cell takes the color read at its sample position (x = col/(cols-1)), while it
   is painted as one whole patch: the two coordinate systems differ by half a cell.
   The marks follow the cells, so a ring sits on the cell that carries the color
   instead of clinging to the seam between two of them. */
function markSpot(point) {
  const { cols, rows } = dims();
  return {
    x: (point.x * (cols - 1) + 0.5) / cols,
    y: (point.y * (rows - 1) + 0.5) / rows,
  };
}

function drawMarkers(w, h) {
  if (!state.markPoints || !state.points.length) return;
  const ctx = ctxOf(el.grid);
  if (!ctx || typeof ctx.beginPath !== "function") return;
  const dpr = dprOf();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const r = Math.max(4, Math.min(10, Math.min(w, h) * 0.018));
  const spots = state.points.map(markSpot);

  if (ctx.save) ctx.save();
  if (ctx.setLineDash) ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255,255,255,.35)";
  for (const spot of spots) {
    const cx = spot.x * w, cy = spot.y * h;
    ctx.beginPath();
    ctx.moveTo(cx, 0); ctx.lineTo(cx, h); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, cy); ctx.lineTo(w, cy); ctx.stroke();
  }
  if (ctx.setLineDash) ctx.setLineDash([]);

  for (const spot of spots) {
    const cx = spot.x * w, cy = spot.y * h;
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(0,0,0,.6)";
    ctx.beginPath(); ctx.arc(cx, cy, r + 2, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = "#ffffff";
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  }
  if (ctx.restore) ctx.restore();
}

function previewLabels() {
  const cw = el.grid.clientWidth || previewSize()[0];
  return state.showHex && labelsAllowed(cw / dims().cols, dims().cols);
}

function repaintPreview() {
  const [cw, ch] = previewSize();
  paintGrid(ctxOf(el.grid), cw, ch, previewLabels());
  drawMarkers(cw, ch);
  drawHover(cw, ch);
}

function render() {
  const d = dims();
  const [W, H] = exportPx();
  const [cw, ch] = previewSize();
  const dpr = dprOf();

  el.grid.style.width = `${cw}px`;
  el.grid.style.height = `${ch}px`;
  el.grid.width = Math.max(1, Math.round(cw * dpr));
  el.grid.height = Math.max(1, Math.round(ch * dpr));

  const labels = state.showHex && labelsAllowed(cw / d.cols, d.cols);
  paintGrid(ctxOf(el.grid), cw, ch, labels);
  drawMarkers(cw, ch);
  drawHover(cw, ch);

  const info = cellMatrix();
  el.summary.textContent =
    `${d.cols} × ${d.rows} = ${info.palette.length} cells · ${info.unique.size} distinct colors` +
    ` · blended in ${CS.spaceLabel(state.space)}` +
    (state.points.length ? ` · ${state.points.length} control point${state.points.length > 1 ? "s" : ""}` : "") +
    (state.showHex && !labels ? " · codes hidden (cells too small)" : "") +
    (d.clamped ? ` · density capped at ${d.density}` : "");

  el.frameInfo.textContent = frameSummary(d, W, H);
  el.exportInfo.textContent = exportSummary(d, W, H);
  el.pointInfo.textContent = pointSummary();
  refreshPointRows();
  el.res.disabled = isCustomSize();
}

function frameSummary(d, W, H) {
  const [, , key] = frameRatio();
  const bits = [
    `${W} × ${H} px`,
    `${d.cols} × ${d.rows} cells`,
    isCustomSize() ? `ratio ${d.p}:${d.q}` : (FORMATS[key] ? FORMATS[key][2] : `ratio ${d.p}:${d.q}`),
  ];
  if (d.clamped) bits.push(`density limited to ${d.limit} (cell budget)`);
  if (!isCustomSize()) {
    const cell = Math.max(1, Math.round(Math.min(W / d.cols, H / d.rows) * 10) / 10);
    bits.push(`cell ≈ ${cell} px in the export`);
  }
  return bits.join(" · ");
}

/* The file name meant for the export is announced before the export, not only
   after it: it follows the settings, one wants to know what one is about to get. */
function exportSummary(d, W, H) {
  const head = isCustomSize()
    ? `PNG ${W} × ${H} px · typed size, the chosen resolution does not apply`
    : `PNG ${W} × ${H} px · long side = ${W} px · ${d.cols * d.rows} cells painted`;
  return `${head} · file: ${exportName(W, H)}`;
}

/* Cells -> coordinates -> actions, on the canvas. */
function cellFromEvent(event) {
  const rect = el.grid.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const { cols, rows } = dims();
  const col = Math.floor((event.clientX - rect.left) / rect.width * cols);
  const row = Math.floor((event.clientY - rect.top) / rect.height * rows);
  if (col < 0 || row < 0 || col >= cols || row >= rows) return null;
  return { col, row };
}

function hexAt(col, row) {
  return cellMatrix().grid[row][col];
}

/* ------------------------- grabbing a control point by its ring -------------------------

   A ring is a handle: pointerdown on one of them, the ring then follows the pointer
   and the gradient bends under it, cell by cell, until the pointer is released.

   A ring is painted on the cell that carries the color, while a point is stored in
   the coordinates the cells are sampled with: the pointer position is therefore
   brought back with the reverse of markSpot(). */

const grabRadius = (rect) =>
  Math.max(4, Math.min(10, Math.min(rect.width, rect.height) * 0.018)) + 4;

/* where the pointer stands on the preview, in fractions of its width and height */
function paintSpotOf(event) {
  const rect = el.grid.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  return {
    fx: (event.clientX - rect.left) / rect.width,
    fy: (event.clientY - rect.top) / rect.height,
    rect,
  };
}

/* index of the ring the pointer sits on, -1 elsewhere. The rings being the only
   handle one can see, a point is grabbable only while they are displayed. */
function ringIndexAt(event) {
  if (!state.markPoints || !state.points.length) return -1;
  const at = paintSpotOf(event);
  if (!at) return -1;
  const radius = grabRadius(at.rect);
  let best = -1, bestGap = Infinity;
  state.points.forEach((point, index) => {
    const spot = markSpot(point);
    const gap = Math.hypot((spot.x - at.fx) * at.rect.width, (spot.y - at.fy) * at.rect.height);
    if (gap < bestGap) { bestGap = gap; best = index; }
  });
  return bestGap <= radius ? best : -1;
}

/* paint coordinates -> sampling coordinates: the reverse of markSpot() */
function sampleOf(fx, fy) {
  const { cols, rows } = dims();
  return {
    x: roundedPoint(cols > 1 ? (fx * cols - 0.5) / (cols - 1) : 0),
    y: roundedPoint(rows > 1 ? (fy * rows - 0.5) / (rows - 1) : 0),
  };
}

const drag = { index: -1, from: null, moved: false, awaited: false };

el.grid.addEventListener("pointerdown", (event) => {
  const index = ringIndexAt(event);
  if (index < 0) return;
  const point = state.points[index];
  drag.index = index;
  drag.from = { x: point.x, y: point.y };
  drag.moved = false;
  drag.awaited = true;              // the click a grab produces belongs to the grab
  hover = null;
  el.grid.classList.add("dragging");
  if (event.preventDefault) event.preventDefault();
});

window.addEventListener("pointermove", (event) => {
  if (drag.index < 0) return;
  const point = state.points[drag.index];
  const at = paintSpotOf(event);
  if (!point || !at) return;
  const spot = sampleOf(clamp01(at.fx), clamp01(at.fy));
  if (spot.x === point.x && spot.y === point.y) return;
  drag.moved = true;
  point.x = spot.x;
  point.y = spot.y;
  render();                         // live: the grid one is heading for, while dragging
  el.grid.title = `control point at ${pointToPercent(point.x)}% × ${pointToPercent(point.y)}% — release to drop it`;
});

function endDrag(event) {
  if (drag.index < 0) return;
  const index = drag.index;
  drag.index = -1;
  el.grid.classList.remove("dragging");

  /* the click following a grab is swallowed — but only where it can really come:
     a pointer released outside the preview produces no click on it */
  if (drag.awaited && event) {
    const rect = el.grid.getBoundingClientRect();
    const inside = event.clientX >= rect.left && event.clientX <= rect.right
      && event.clientY >= rect.top && event.clientY <= rect.bottom;
    if (!inside) drag.awaited = false;
  }

  const point = state.points[index];
  if (!point) return;
  const { cols, rows } = dims();
  if (atCornerPosition(point, cols, rows)) {
    point.x = drag.from.x;          // a ring never swallows a corner
    point.y = drag.from.y;
    toast("A control point cannot replace a corner — it goes back where it was");
  } else if (drag.moved) {
    toast(`Control point moved to ${pointToPercent(point.x)}% × ${pointToPercent(point.y)}%`);
  }
  update();
  renderPoints();
}

window.addEventListener("pointerup", endDrag);
window.addEventListener("pointercancel", endDrag);

el.grid.addEventListener("mousemove", (event) => {
  if (drag.index >= 0) return;      // the ring holds the pointer, not the cell under it
  /* a ring under the pointer announces itself as grabbable */
  if (drag.index < 0) el.grid.style.cursor = ringIndexAt(event) >= 0 ? "grab" : "";
  const at = cellFromEvent(event);
  const same = at && hover && at.col === hover.col && at.row === hover.row;
  if (same) return;
  hover = at;
  repaintPreview();
  el.grid.title = at ? cellTitle(at.col, at.row) : "";
});

el.grid.addEventListener("mouseleave", () => {
  hover = null;
  el.grid.style.cursor = "";
  repaintPreview();
});

/* What a click on that cell would do, spelled out in the tool tip. */
function cellTitle(col, row) {
  const corner = cornerAt(col, row);
  if (corner) return `${labelForCorner(corner)} — click to change this color`;

  const hex = hexAt(col, row).toUpperCase();
  const index = pointIndexAt(col, row);
  if (index >= 0) {
    const p = state.points[index];
    return `${hex} · control point at ${pointToPercent(p.x)}% × ${pointToPercent(p.y)}% — click to update it, drag its ring to move it`;
  }
  return state.pickMode
    ? `${hex} — click to place a control point · Shift+click copies the code`
    : `${hex} — click to copy the code · Shift+click places a control point`;
}

el.grid.addEventListener("click", (event) => {
  if (drag.awaited) {              // one was dragging a ring: the click changes nothing else
    drag.awaited = false;
    return;
  }
  const at = cellFromEvent(event);
  if (!at) return;
  const corner = cornerAt(at.col, at.row);
  if (corner) {                       // the 4 corners are edited right on the preview
    el.pickers[corner].click();
    return;
  }

  /* Shift always asks for the opposite of a plain click: whichever action the
     "Click places a control point" box leaves on a click, the other one stays one
     keypress away */
  const wantsPoint = event.shiftKey ? !state.pickMode : state.pickMode;
  if (wantsPoint) {
    addPointAt(at.col, at.row);
    return;
  }

  const hex = hexAt(at.col, at.row);
  copy(hex.toUpperCase(), `Copied: ${hex.toUpperCase()}`);
  el.picked.innerHTML = `<span class="swatch" style="background:${hex}"></span>${hex.toUpperCase()}`;
});

el.copyPalette.addEventListener("click", () => {
  const hexes = [...new Set(cellMatrix().palette.map((h) => h.toUpperCase()))];
  copy(hexes.join(", "), `${hexes.length} codes copied`);
});

/* ------------------- control points: actions and panel rows -------------------

   A point takes as its starting color the color already painted there: adding one
   therefore changes nothing visible until its color is picked in the panel — the
   gradient then bends around it. */

function addPointAt(col, row) {
  const at = pointPositionAt(col, row);
  const { cols, rows } = dims();
  if (atCornerPosition(at, cols, rows)) {
    toast("A control point cannot replace a corner — raise the density");
    return;
  }
  const where = `${pointToPercent(at.x)}% × ${pointToPercent(at.y)}%`;
  const found = state.points.findIndex((p) => nearPoint(p, at));

  if (found >= 0) {
    state.points[found] = { x: at.x, y: at.y, color: hexAt(col, row) };
    update();
    renderPoints();
    toast(`Control point brought back onto the cell at ${where}`);
    return;
  }
  if (state.points.length >= MAX_POINTS) {
    toast(`Control point refused: ${MAX_POINTS} at most`);
    return;
  }
  state.points.push({ x: at.x, y: at.y, color: hexAt(col, row) });
  update();
  renderPoints();
  toast(`Control point added at ${where} — pick its color in the panel`);
}

/* a position typed by hand: an empty or nonsensical value changes nothing */
const parsePercent = (text) => {
  const t = String(text).trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? clamp01(n / 100) : undefined;
};

/* Rows are rebuilt only when the list itself changes (a point added, removed, a
   grid loaded): editing a color or a position must not throw the row away
   while it is being edited. */
let pointRows = [];

function refreshPointRows() {
  pointRows.forEach((row, index) => {
    const p = state.points[index];
    if (p && row.hex) row.hex.textContent = p.color.toUpperCase();
  });
}

function pointSummary() {
  if (!state.points.length) {
    return "None yet: click a cell of the grid to place one, then pick its color.";
  }
  const n = state.points.length;
  return `${n} control point${n > 1 ? "s" : ""} · positions in % of the width (from the left)` +
    " and of the height (from the top) · the 4 corners stay intact" +
    (state.markPoints
      ? " · marks shown on the preview only · press a ring and drag it to move its point"
      : " · marks hidden, so no ring to grab");
}

function percentField(value, title) {
  const input = document.createElement("input");
  input.type = "number";
  input.min = "0";
  input.max = "100";
  input.step = "0.5";
  input.value = String(value);
  input.title = title;
  return input;
}

function renderPoints() {
  el.pointList.textContent = "";
  pointRows = [];

  state.points.forEach((point, index) => {
    const row = document.createElement("div");
    row.className = "point-item";

    const swatch = document.createElement("input");
    swatch.type = "color";
    swatch.value = point.color;
    swatch.className = "point-color";
    swatch.title = "Color imposed at this spot";
    swatch.addEventListener("input", () => {
      point.color = swatch.value;
      update();
    });

    const x = percentField(pointToPercent(point.x), "Position along the width, in % from the left edge");
    x.addEventListener("change", () => {
      const v = parsePercent(x.value);
      if (v === undefined) { x.value = String(pointToPercent(point.x)); return; }
      point.x = roundedPoint(v);
      x.value = String(pointToPercent(point.x));
      update();
    });

    const y = percentField(pointToPercent(point.y), "Position along the height, in % from the top edge");
    y.addEventListener("change", () => {
      const v = parsePercent(y.value);
      if (v === undefined) { y.value = String(pointToPercent(point.y)); return; }
      point.y = roundedPoint(v);
      y.value = String(pointToPercent(point.y));
      update();
    });

    const hex = document.createElement("span");
    hex.className = "point-hex";
    hex.textContent = point.color.toUpperCase();

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "point-remove";
    remove.textContent = "×";
    remove.title = "Remove this control point";
    remove.addEventListener("click", () => {
      const where = `${pointToPercent(point.x)}% × ${pointToPercent(point.y)}%`;
      state.points.splice(index, 1);
      update();
      renderPoints();
      toast(`Control point removed at ${where}`);
    });

    row.append(swatch, x, y, hex, remove);
    el.pointList.appendChild(row);
    pointRows.push({ hex });
  });

  el.pointInfo.textContent = pointSummary();
}

function copy(text, message) {
  const done = () => toast(message);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
  } else {
    fallbackCopy(text, done);
  }
}

function fallbackCopy(text, done) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand("copy"); done(); } catch (error) { toast("Copy failed: " + text); }
  ta.remove();
}

let toastTimer;
function toast(message) {
  el.toast.textContent = message;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.hidden = true; }, 1900);
}

/* ------------------------------ export PNG ------------------------------ */

function slug(text) {
  return String(text || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 24);
}

/* The file name says what went into the image: the actual lattice (cols x rows),
   the density kept after any cap, the format asked for, the blending space,
   whether codes are painted, and the final size in pixels.
   A custom size adds no ratio: its dimensions already are the final size, writing
   them twice would add nothing. */
function exportName(w, h) {
  const d = dims();
  const parts = ["colorgrid"];
  const name = slug(state.name);
  if (name) parts.push(name);
  parts.push(`${d.cols}x${d.rows}`);
  parts.push(`d${d.density}`);
  if (!isCustomSize()) parts.push(`${d.p}x${d.q}`);
  parts.push(CS.DEFAULT_SPACE === state.space ? "srgb" : state.space);
  /* control points change the image itself: the name says how many */
  if (state.points.length) parts.push(`cp${state.points.length}`);
  if (state.exportHex) parts.push("hex");
  parts.push(`${w}x${h}`);
  return parts.join("_") + ".png";
}

let exporting = false;

function exportPNG() {
  if (exporting) return;
  const d = dims();
  const [w, h] = exportPx();

  const done = (message) => {
    exporting = false;
    el.exportBtn.disabled = false;
    el.exportBtn.textContent = "Export PNG ↓";
    if (message) toast(message);
  };

  exporting = true;
  el.exportBtn.disabled = true;
  el.exportBtn.textContent = "Exporting…";

  /* The canvas is the exact size asked for: 1K = 1024 px on the long side, not
     an enlargement of the preview. */
  const canvas = document.createElement("canvas");
  try {
    canvas.width = w;
    canvas.height = h;
  } catch (error) {
    done(`Export failed: ${w} × ${h} px refused by the browser`);
    return;
  }

  const ctx = ctxOf(canvas);
  if (!ctx) {
    done("Export failed: 2D drawing is not available here");
    return;
  }

  const name = exportName(w, h);
  const save = (blob) => {
    done();
    if (!blob) {
      toast("Export failed: the browser did not produce the PNG");
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    el.exportInfo.textContent = `PNG ${w} × ${h} px written: ${name}`;
    toast(`PNG exported: ${name}`);
  };

  try {
    /* one canvas pixel per requested pixel: no dpr, no scaling */
    paintGrid(ctx, w, h, state.exportHex && labelsAllowed(w / d.cols, d.cols), 1, 120);

    if (canvas.toBlob) {
      /* asynchronous: the button stays inactive until the PNG is ready, a 4K
         image can take a second or two */
      canvas.toBlob((blob) => save(blob), "image/png");
    } else {
      /* browsers without toBlob: the same image as a data URL */
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = name;
      a.click();
      done();
      el.exportInfo.textContent = `PNG ${w} × ${h} px written: ${name}`;
      toast(`PNG exported: ${name}`);
    }
  } catch (error) {
    done(`Export failed: ${d.cols * d.rows} cells at ${w} × ${h} px`);
  }
}

el.exportBtn.addEventListener("click", exportPNG);

/* ------------------------------ settings ------------------------------ */

FORMAT_ORDER.forEach((key) => {
  const option = document.createElement("option");
  option.value = key;
  option.textContent = FORMATS[key][2];
  el.format.appendChild(option);
});

RESOLUTIONS.forEach(([value, label]) => {
  const option = document.createElement("option");
  option.value = String(value);
  option.textContent = label;
  el.res.appendChild(option);
});

el.format.addEventListener("change", () => {
  state.format = FORMATS[el.format.value] ? el.format.value : "1:1";
  el.format.value = state.format;
  el.rowCustom.hidden = !isCustomSize();
  el.density.max = String(densityLimit(...frameRatio()));
  update();
});

el.fmtW.addEventListener("input", () => {
  state.frameW = sanitizeInt(el.fmtW.value, state.frameW, FRAME_MIN, FRAME_MAX);
  el.fmtW.value = state.frameW;
  update();
});

el.fmtH.addEventListener("input", () => {
  state.frameH = sanitizeInt(el.fmtH.value, state.frameH, FRAME_MIN, FRAME_MAX);
  el.fmtH.value = state.frameH;
  update();
});

el.density.addEventListener("input", () => {
  state.density = sanitizeInt(el.density.value, state.density, 1, DENSITY_CAP);
  el.density.value = state.density;
  el.density.max = String(densityLimit(...frameRatio()));
  update();
});

el.res.addEventListener("change", () => {
  state.res = sanitizeInt(el.res.value, state.res, 64, FRAME_MAX);
  el.res.value = String(state.res);
  update();
});

el.name.addEventListener("input", () => {
  state.name = sanitizeName(el.name.value);
  persist();                       // only the list changes: no need to redraw
});

/* leaving the field: the name shown and the name stored are aligned
   (while typing we do not correct, so an empty name can be typed) */
el.name.addEventListener("blur", () => {
  state.name = sanitizeName(el.name.value);
  el.name.value = state.name;
  persist();
});

el.showHex.addEventListener("change", () => {
  state.showHex = el.showHex.checked;
  writeParams();
  render();
});

el.exportHex.addEventListener("change", () => {
  state.exportHex = el.exportHex.checked;
  writeParams();
  render();
});

el.pickMode.addEventListener("change", () => {
  state.pickMode = el.pickMode.checked;
  writeParams();
  render();
  persist();
});

el.markPoints.addEventListener("change", () => {
  state.markPoints = el.markPoints.checked;
  writeParams();
  render();
  persist();
});

CS.spaceNames().forEach((name) => {
  const option = document.createElement("option");
  option.value = name;
  option.textContent = CS.SPACES[name].label;
  el.space.appendChild(option);
});

el.space.addEventListener("change", () => {
  state.space = CS.isSpace(el.space.value) ? el.space.value : CS.DEFAULT_SPACE;
  el.space.value = state.space;
  el.spaceHint.textContent = CS.spaceHint(state.space);
  update();
});

el.regen.addEventListener("click", () => { render(); toast("Grid regenerated"); });

if (el.copyLink) {
  el.copyLink.addEventListener("click", () => {
    writeParams();
    copy(location.href, "Link copied: settings and colors included");
  });
}

for (const [key, input] of Object.entries(el.pickers)) {
  input.addEventListener("input", () => {
    state.colors[key] = input.value;
    update();
  });
}

window.addEventListener("resize", () => {
  /* the lattice does not change, only the preview size follows the window */
  render();
});

function sanitizeInt(value, fallback, min, max) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function sanitizeName(value) {
  const name = String(value || "").trim().replace(/\s+/g, " ").slice(0, MAX_NAME);
  return name || "My Grid";
}

/* A name serves as both identifier and label: the name shown in the list and the
   name in the field stay aligned. */
const namesEqual = (a, b) =>
  a.localeCompare(b, "en", { sensitivity: "base" }) === 0;

/* ------------------------- settings in the address -------------------------

   The settings are written in the address fragment (#F=16x9&n=13&sp=oklch…) as in
   the truchet project. The fragment rather than the query (?F=16) for two reasons:
   it triggers no reload, and it works in file:// — history.replaceState is
   sometimes refused there, the fallback onto location.hash takes over, and the
   replacement avoids piling up one history entry per setting.

   The link is rewritten at every change and read again at startup: an address
   shared or bookmarked reopens the grid as it was. Two writing precautions: HEX
   codes without the "#" (a # lost inside the address would cut off what follows),
   and the colons of a format written as "x" (16x9) for a readable link. */

const PARAM_KEYS = {
  format: "F", frameW: "fw", frameH: "fh", density: "n", res: "rs",
  space: "sp", name: "nm", showHex: "hx", exportHex: "ex",
  pickMode: "pm", markPoints: "mk", points: "P",
};

const CORNER_PARAM_KEYS = { topLeft: "c1", topRight: "c2", bottomLeft: "c3", bottomRight: "c4" };
const CORNER_JSON_KEYS = {
  topLeft: "color_top_left", topRight: "color_top_right",
  bottomLeft: "color_bottom_left", bottomRight: "color_bottom_right",
};

/* Control points in one key: `P=50x50_00ff00*12x80_ff8800` — position in % along
   the width and the height, then the color, points separated by "*". Only "*" and
   "_" survive the address untouched (a "," or a ";" would come out percent-encoded
   and make the link unreadable). "P=" with nothing after it means: no control
   point at all — otherwise a link would silently keep the points of the grid one
   had opened before. */
const POINT_PATTERN = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)_([0-9a-f]{3}|[0-9a-f]{6})$/i;

function pointsToParam() {
  return state.points
    .map((p) => `${pointToPercent(p.x)}x${pointToPercent(p.y)}_${p.color.replace("#", "").toLowerCase()}`)
    .join("*");
}

function pointsFromParam(text) {
  const out = [];
  for (const chunk of String(text || "").split("*")) {
    const m = POINT_PATTERN.exec(chunk.trim());
    if (!m) continue;
    out.push({
      x: clamp01(Number(m[1]) / 100),
      y: clamp01(Number(m[2]) / 100),
      color: hexToRgb(m[3]),
    });
    if (out.length >= MAX_POINTS) break;
  }
  return out;
}

function paramsToString() {
  const p = new URLSearchParams();
  p.set(PARAM_KEYS.format, String(state.format).replace(/:/g, "x"));
  p.set(PARAM_KEYS.frameW, String(state.frameW));
  p.set(PARAM_KEYS.frameH, String(state.frameH));
  p.set(PARAM_KEYS.density, String(state.density));
  p.set(PARAM_KEYS.res, String(state.res));
  p.set(PARAM_KEYS.space, state.space);
  p.set(PARAM_KEYS.name, state.name);
  p.set(PARAM_KEYS.showHex, state.showHex ? "1" : "0");
  p.set(PARAM_KEYS.exportHex, state.exportHex ? "1" : "0");
  p.set(PARAM_KEYS.pickMode, state.pickMode ? "1" : "0");
  p.set(PARAM_KEYS.markPoints, state.markPoints ? "1" : "0");
  p.set(PARAM_KEYS.points, pointsToParam());
  for (const [corner, key] of Object.entries(CORNER_PARAM_KEYS)) {
    p.set(key, String(state.colors[corner]).replace("#", "").toLowerCase());
  }
  /* a space is written %20 and not "+": inside a fragment, a "+" only means a
     space when somebody wrote it literally — the mix-up would silently change a
     grid name */
  return p.toString().replace(/\+/g, "%20");
}

function writeParams() {
  const wanted = paramsToString();
  if (location.hash.slice(1) !== wanted) {
    try {
      if (window.history && history.replaceState) history.replaceState(null, "", "#" + wanted);
      else location.hash = wanted;
    } catch (error) {
      /* opened in file://: replacing without a history entry is refused, the
         fragment is written anyway — it is what carries the settings */
      location.hash = wanted;
    }
  }
  if (el.linkInfo) el.linkInfo.textContent = `Address updated: #${wanted}`;
}

/* Reads the address: fragment first, query after (an address pasted with a "?"
   stays readable). A missing key keeps its default value; a nonsensical key
   (density "abc", color "zz", unknown space) falls back on the default, just as a
   damaged record does. */
function readParams() {
  const p = new URLSearchParams(location.search.slice(1));
  for (const [key, value] of new URLSearchParams(location.hash.slice(1))) p.set(key, value);

  const config = {};
  const flags = {};
  let found = false;
  const keep = (key, value) => { if (value !== undefined) { config[key] = value; found = true; } };

  const number = (key) => {
    if (!p.has(key)) return undefined;
    const n = Number(String(p.get(key)).trim());
    return Number.isFinite(n) ? n : undefined;
  };
  const flag = (key) => {
    if (!p.has(key)) return undefined;
    const v = String(p.get(key)).trim().toLowerCase();
    if (v === "1" || v === "true" || v === "yes") return true;
    /* a value we do not recognize is not a "no": it leaves the default value in
       place, like a missing key */
    if (v === "0" || v === "false" || v === "no") return false;
    return undefined;
  };

  if (p.has(PARAM_KEYS.format)) {
    const raw = String(p.get(PARAM_KEYS.format)).trim().toLowerCase();
    const ratio = raw.replace(/x/g, ":");
    keep("format", FORMATS[ratio] ? ratio : (raw === "custom" ? "custom" : undefined));
  }
  keep("frame_w", number(PARAM_KEYS.frameW));
  keep("frame_h", number(PARAM_KEYS.frameH));
  keep("density", number(PARAM_KEYS.density));
  keep("res", number(PARAM_KEYS.res));
  if (p.has(PARAM_KEYS.space)) keep("space", String(p.get(PARAM_KEYS.space)).trim());
  if (p.has(PARAM_KEYS.name)) keep("grid_name", p.get(PARAM_KEYS.name));

  for (const [corner, key] of Object.entries(CORNER_PARAM_KEYS)) {
    if (!p.has(key)) continue;
    const raw = String(p.get(key)).trim().toLowerCase().replace("#", "");
    if (!/^[0-9a-f]{3}$|^[0-9a-f]{6}$/.test(raw)) continue;
    keep(CORNER_JSON_KEYS[corner], hexToRgb(raw));
  }

  const showHex = flag(PARAM_KEYS.showHex);
  if (showHex !== undefined) { flags.showHex = showHex; found = true; }
  const exportHex = flag(PARAM_KEYS.exportHex);
  if (exportHex !== undefined) { flags.exportHex = exportHex; found = true; }
  const pickMode = flag(PARAM_KEYS.pickMode);
  if (pickMode !== undefined) { flags.pickMode = pickMode; found = true; }
  const markPoints = flag(PARAM_KEYS.markPoints);
  if (markPoints !== undefined) { flags.markPoints = markPoints; found = true; }

  /* the key is read as the whole list: an address that carries no P keeps the
     points it was opened with, an address with an empty P asks for none */
  if (p.has(PARAM_KEYS.points)) keep("points", pointsFromParam(p.get(PARAM_KEYS.points)));

  return found ? { config, flags } : null;
}

/* ------------------------------ storage ------------------------------ */

const store = new GridStore();

function configFromState() {
  return {
    grid_name: state.name,
    format: state.format,
    density: state.density,
    frame_w: state.frameW,
    frame_h: state.frameH,
    res: state.res,
    space: state.space,
    color_top_left: hexToRgb(state.colors.topLeft).map(round6),
    color_top_right: hexToRgb(state.colors.topRight).map(round6),
    color_bottom_left: hexToRgb(state.colors.bottomLeft).map(round6),
    color_bottom_right: hexToRgb(state.colors.bottomRight).map(round6),
    /* control points: positions as fractions of the frame, colors as sRGB */
    points: state.points.map((p) => ({
      x: p.x, y: p.y, color: hexToRgb(p.color).map(round6),
    })),
    pick_mode: state.pickMode,
    mark_points: state.markPoints,
  };
}

const round6 = (v) => Math.round(v * 1e6) / 1e6;

function dimsFor(p, q, density) {
  const limit = densityLimit(p, q);
  const d = Math.max(1, Math.min(density, limit));
  return p >= q
    ? { cols: Math.max(1, Math.round(d * p / q)), rows: d, density: d, limit }
    : { cols: d, rows: Math.max(1, Math.round(d * q / p)), density: d, limit };
}

/* Configuration read from storage, corrected: an unknown format falls back on
   the square, a density out of bounds is brought back, a custom size with too
   large a ratio is reduced. */
function configShape(config) {
  const format = FORMATS[config.format] ? config.format : "1:1";
  const frame_w = sanitizeInt(config.frame_w, 16, FRAME_MIN, FRAME_MAX);
  const frame_h = sanitizeInt(config.frame_h, 9, FRAME_MIN, FRAME_MAX);
  const [p, q] = format === "custom"
    ? approxRatio(frame_w, frame_h, false)
    : FORMATS[format].slice(0, 2);
  const density = sanitizeInt(config.density, 5, 1, DENSITY_CAP);
  return { format, frame_w, frame_h, density, ratio: [p, q], dims: dimsFor(p, q, density) };
}

/* Lattice of a record, for the small labels in the list. */
function configDims(config) {
  return configShape(config).dims;
}

/* Applies a configuration read from storage, correcting values out of bounds. */
function applyConfig(config) {
  const shape = configShape(config);

  state.format = shape.format;
  state.density = shape.density;
  state.frameW = shape.frame_w;
  state.frameH = shape.frame_h;
  state.res = sanitizeInt(config.res, 2048, 64, FRAME_MAX);
  state.name = sanitizeName(config.grid_name);
  state.space = CS.isSpace(config.space) ? config.space : CS.DEFAULT_SPACE;

  const map = {
    color_top_left: "topLeft", color_top_right: "topRight",
    color_bottom_left: "bottomLeft", color_bottom_right: "bottomRight",
  };
  for (const [jsonKey, stateKey] of Object.entries(map)) {
    const value = config[jsonKey];
    if (Array.isArray(value) && value.length === 3) state.colors[stateKey] = arrayToHex(value);
  }

  /* a record from before the control points simply has none */
  state.points = sanitizePointList(config.points);
  if (config.pick_mode !== undefined) state.pickMode = Boolean(config.pick_mode);
  if (config.mark_points !== undefined) state.markPoints = Boolean(config.mark_points);

  el.format.value = state.format;
  el.rowCustom.hidden = !isCustomSize();
  el.density.value = state.density;
  el.density.max = String(densityLimit(...frameRatio()));
  el.fmtW.value = state.frameW;
  el.fmtH.value = state.frameH;
  el.res.value = String(state.res);
  el.name.value = state.name;
  el.space.value = state.space;
  el.spaceHint.textContent = CS.spaceHint(state.space);
  for (const [key, input] of Object.entries(el.pickers)) input.value = state.colors[key];
  el.pickMode.checked = state.pickMode;
  el.markPoints.checked = state.markPoints;
  renderPoints();
}

/* Redraw + remembering the current state (the page reopens as it was left),
   then refreshing the grid list. */
function update() {
  render();
  persist();
}

function persist() {
  store.saveCurrent(configFromState());
  writeParams();
  renderGridList();
}

el.save.addEventListener("click", () => {
  state.name = sanitizeName(el.name.value);   // an empty name falls back on "My Grid"
  el.name.value = state.name;
  const config = configFromState();
  const existing = store.list().find((name) => namesEqual(name, config.grid_name));

  if (existing && !window.confirm(`“${existing}” already exists.\nReplace the saved grid?`)) {
    el.name.value = state.name;
    return;
  }
  if (existing) store.remove(existing);   // avoids duplicates differing only by case / spaces

  const saved = store.save(config);
  update();
  toast(saved ? `Grid saved: ${config.grid_name}` : `Saved, but not kept: ${config.grid_name}`);
});

function renderGridList() {
  const names = store.list();
  el.gridList.textContent = "";

  if (!names.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No saved grids";
    el.gridList.appendChild(empty);
    return;
  }

  for (const name of names) {
    const config = store.get(name);
    const d = configDims(config);
    const item = document.createElement("div");
    item.className = "grid-item" + (namesEqual(name, state.name) ? " active" : "");

    const open = document.createElement("button");
    open.type = "button";
    open.className = "grid-open";
    open.textContent = name;
    open.title = `Load ${name}`;
    open.addEventListener("click", () => {
      applyConfig(config);
      update();
      toast(`Grid loaded: ${name}`);
    });

    const rename = document.createElement("button");
    rename.type = "button";
    rename.className = "grid-rename";
    rename.textContent = "✎";
    rename.title = "Rename";
    rename.addEventListener("click", () => {
      const input = window.prompt("New name for the grid", name);
      if (input === null) return;
      const target = sanitizeName(input);
      if (target === name) return;
      if (!store.rename(name, target)) {
        toast(`Rename failed: “${target}” already exists`);
        return;
      }
      /* that name only stands for the grid being shown if it really is that one:
         otherwise the "My grid" field and the preview do not move */
      if (namesEqual(name, state.name)) {
        state.name = target;
        el.name.value = target;
        persist();
      } else {
        renderGridList();
      }
      toast(`Grid renamed: ${name} → ${target}`);
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "grid-remove";
    remove.textContent = "×";
    remove.title = "Delete";
    remove.addEventListener("click", () => {
      if (!window.confirm(`Delete “${name}”?`)) return;
      store.remove(name);
      /* the deleted grid stays on screen, but is no longer remembered as the
         "last grid shown" when it was that one */
      if (namesEqual(name, state.name)) store.clearCurrent();
      renderGridList();
      toast(`Grid deleted: ${name}`);
    });

    const meta = document.createElement("span");
    meta.className = "grid-dims";
    const tags = [`${d.cols}×${d.rows}`];
    if (CS.isSpace(config.space) && config.space !== CS.DEFAULT_SPACE) tags.push(CS.spaceLabel(config.space));
    if (config.format && config.format !== "1:1") tags.push(config.format);
    const points = sanitizePointList(config.points);
    if (points.length) tags.push(`${points.length} control point${points.length > 1 ? "s" : ""}`);
    meta.textContent = tags.join(" · ");

    item.append(open, meta, rename, remove);
    el.gridList.appendChild(item);
  }
}

/* ------------------------------ startup ------------------------------ */

function boot() {
  el.space.value = state.space;
  el.spaceHint.textContent = CS.spaceHint(state.space);
  el.res.value = String(state.res);
  el.density.max = String(densityLimit(...frameRatio()));

  if (!store.persistent) {
    el.storageNote.hidden = false;
    el.storageNote.textContent =
      "Browser storage unavailable: grids will not be kept after the page is closed.";
  }

  const current = store.loadCurrent();
  const shared = readParams();

  /* a shared address comes before the last grid shown: that is exactly what one
     expects from a link received or a bookmark */
  if (shared) {
    applyConfig(shared.config);
    if (shared.flags.showHex !== undefined) {
      state.showHex = shared.flags.showHex;
      el.showHex.checked = state.showHex;
    }
    if (shared.flags.exportHex !== undefined) {
      state.exportHex = shared.flags.exportHex;
      el.exportHex.checked = state.exportHex;
    }
    if (shared.flags.pickMode !== undefined) {
      state.pickMode = shared.flags.pickMode;
      el.pickMode.checked = state.pickMode;
    }
    if (shared.flags.markPoints !== undefined) {
      state.markPoints = shared.flags.markPoints;
      el.markPoints.checked = state.markPoints;
    }
  } else if (current) {
    applyConfig(current);            // reopens on the last grid shown
  }

  writeParams();                    // the address always reflects the real state
  render();
  renderPoints();
  renderGridList();
}

boot();
