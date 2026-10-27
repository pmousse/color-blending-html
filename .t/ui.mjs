/* UI test harness: loads the page in jsdom, without a real canvas but with a
   recording 2D context, then checks format / density / export.

   node .t/ui.mjs   (from D:/blend_colors_html)  */

import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const R = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

const html = R("../index.html");
const sources = [R("../storage.js"), R("../colorspaces.js"), R("../app.js")];

const dom = new JSDOM(html, {
  runScripts: "dangerously", pretendToBeVisual: true, url: "http://localhost/",
});
const win = dom.window;
const doc = win.document;

/* ------------------- environment plugs ------------------- */

const painted = { fills: [], texts: [], strokes: [], arcs: [] };
const fakeCtx = {
  fillStyle: "#000", font: "", textAlign: "", textBaseline: "", lineWidth: 1, strokeStyle: "",
  /* every draw starts from scratch: the arrays describe the last image */
  setTransform() {},
  clearRect() { painted.fills.length = 0; painted.texts.length = 0; painted.strokes.length = 0; painted.arcs.length = 0; },
  fillRect(x, y, w, h) { painted.fills.push([this.fillStyle, x, y, w, h]); },
  fillText(t, x, y) { painted.texts.push([t, x, y]); },
  strokeRect(x, y, w, h) { painted.strokes.push(["rect", this.strokeStyle, x, y, w, h]); },
  /* control point marks: rings and guide crosses */
  save() {}, restore() {}, setLineDash(v) { this.dash = v; },
  beginPath() { this.path = []; }, closePath() {},
  moveTo(x, y) { (this.path = this.path || []).push(["move", x, y]); },
  lineTo(x, y) { (this.path = this.path || []).push(["line", x, y]); },
  arc(x, y, r) { (this.path = this.path || []).push(["arc", x, y, r]); painted.arcs.push([x, y]); },
  stroke() { painted.strokes.push(["path", this.strokeStyle, JSON.stringify(this.path || [])]); },
};
win.HTMLCanvasElement.prototype.getContext = () => fakeCtx;
win.HTMLCanvasElement.prototype.toBlob = function (cb) { cb({ kind: "png", size: 4096 }); };

const downloads = [];
win.HTMLAnchorElement.prototype.click = function () {
  downloads.push(this.getAttribute("download"));
};
win.URL.createObjectURL = () => "blob:fake";
win.URL.revokeObjectURL = () => {};

const clips = [];
win.navigator.clipboard = { writeText: (t) => { clips.push(t); return Promise.resolve(); } };
win.confirm = () => true;
win.prompt = () => null;

const $ = (id) => doc.getElementById(id);
const frame = $("frame");
Object.defineProperty(frame, "clientWidth", { value: 900, configurable: true });
Object.defineProperty(frame, "clientHeight", { value: 700, configurable: true });

/* ------------------- loading the scripts ------------------- */

const bridge = "\n;globalThis.__api = { dims, dimsFor, exportPx, configDims, configShape, approxRatio," +
  " cellMatrix, previewSize, densityLimit, exportName, FORMATS, RESOLUTIONS," +
  " MAX_CELLS, DENSITY_CAP, MAX_POINTS, state, addPointAt, renderPoints, pointIndexAt, render," +
  " currentRamp, rampPoints, pointPositionAt, pointToPercent, sanitizePointList," +
  " pointsToParam, pointsFromParam, cellTitle, markSpot, sampleOf, ringIndexAt, drag };";

const runIn = (target, sources, extra = bridge) => {
  const errors = [];
  target.virtualConsole.on("jsdomError", (e) => errors.push(e.message));
  for (const src of sources) {
    const node = target.window.document.createElement("script");
    node.textContent = src;
    target.window.document.body.appendChild(node);
  }
  if (extra) {
    const node = target.window.document.createElement("script");
    node.textContent = extra;
    target.window.document.body.appendChild(node);
  }
  if (errors.length) {
    console.log("script errors:\n" + errors.join("\n"));
    process.exit(1);
  }
};

runIn(dom, sources);
const api = dom.window.__api;

/* the preview canvas needs a measurable box inside jsdom */
$("grid").getBoundingClientRect = () => ({ left: 0, top: 0, width: 700, height: 700, right: 700, bottom: 700 });
for (const key of ["topLeft", "topRight", "bottomLeft", "bottomRight"]) {
  $("c-" + key.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase())).click = () => cornerClicks.push(key);
}
const cornerClicks = win.__cornerClicks = [];

/* ------------------- small assertion harness ------------------- */

let pass = 0, fail = 0;
const ok = (label, condition, detail) => {
  if (condition) { pass++; return; }
  fail++;
  console.log(`FAIL  ${label}${detail === undefined ? "" : `  ->  ${detail}`}`);
};
const eq = (label, got, want) =>
  ok(label, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);

const setSelect = (id, value) => {
  const node = $(id);
  node.value = value;
  node.dispatchEvent(new win.Event("change"));
};
const setInput = (id, value) => {
  const node = $(id);
  node.value = String(value);
  node.dispatchEvent(new win.Event("input"));
};
const D = () => api.dims();
const summary = () => $("summary").textContent;

/* ------------------- 1. settings present ------------------- */

eq("13 formats offered", $("format").options.length, 13);
eq("5 resolutions offered", $("res").options.length, 5);
eq("6 blending spaces", $("space").options.length, 6);
eq("default density", $("density").value, "5");
eq("default resolution", $("res").value, "2048");
ok("custom fields hidden at first", $("rowCustom").hidden);

/* ------------------- 2. default: square, density 5 ------------------- */

eq("default lattice", [D().cols, D().rows], [5, 5]);
eq("default pixels", api.exportPx(), [2048, 2048]);
ok("summary gives the lattice", summary().includes("5 × 5 = 25 cells"), summary());
ok("summary gives the space", summary().includes("blended in sRGB"), summary());
ok("frame info gives the size", $("frame-info").textContent.includes("2048 × 2048 px"), $("frame-info").textContent);
eq("square preview", api.previewSize(), [700, 700]);

/* ------------------- 3. formats ------------------- */

setSelect("format", "16:9");
eq("16:9 density 5 -> 9 x 5", [D().cols, D().rows], [9, 5]);
eq("16:9 in 2K", api.exportPx(), [2048, 1152]);
ok("frame info 16:9", $("frame-info").textContent.includes("2048 × 1152 px"), $("frame-info").textContent);
eq("16:9 preview limited by the width", api.previewSize(), [900, 506]);

setSelect("format", "9:16");
eq("9:16 density 5 -> 5 x 9", [D().cols, D().rows], [5, 9]);
eq("9:16 in 2K", api.exportPx(), [1152, 2048]);
eq("9:16 preview limited by the height", api.previewSize(), [393, 700]);

setSelect("format", "4:5");
eq("4:5 density 5 -> 5 x 6", [D().cols, D().rows], [5, 6]);
eq("4:5 in 2K", api.exportPx(), [1638, 2048]);

setSelect("format", "1:1");
eq("back to square", [D().cols, D().rows], [5, 5]);

/* ------------------- 4. cell ceiling ------------------- */

setSelect("format", "21:9");
setInput("density", 64);
ok("density capped for 21:9", D().density < 64, `density ${D().density}`);
eq("capped lattice 21:9", [D().cols, D().rows], [138, 59]);
ok("cell budget respected", D().cols * D().rows <= api.MAX_CELLS, `${D().cols * D().rows}`);
ok("the summary warns about the ceiling", summary().includes("density capped at 59"), summary());
eq("ceiling announced to the field", $("density").max, "59");
setSelect("format", "1:1");
setInput("density", 64);
eq("square accepts 64", [D().cols, D().rows], [64, 64]);
setInput("density", 5);

/* ------------------- 5. custom size ------------------- */

setSelect("format", "custom");
ok("custom fields shown", !$("rowCustom").hidden);
ok("resolution made useless", $("res").disabled);
setInput("fmtW", 1920);
setInput("fmtH", 1080);
eq("custom size taken as it is", api.exportPx(), [1920, 1080]);
ok("1920x1080 brought back to ratio 16:9", $("frame-info").textContent.includes("ratio 16:9"), $("frame-info").textContent);
eq("lattice 1920x1080 at density 5", [D().cols, D().rows], [9, 5]);
setInput("fmtW", 8192);
setInput("fmtH", 16);
ok("extreme ratio reduced to 512:1", api.exportPx().length === 2 && api.exportPx()[0] === 8192, JSON.stringify(api.exportPx()));
ok("cell budget held even at an extreme ratio", D().cols * D().rows <= api.MAX_CELLS, `${D().cols}x${D().rows}`);
ok("the summary warns about the ceiling", summary().includes("density capped at"), summary());
eq("extreme custom size", api.exportPx(), [8192, 16]);
setInput("fmtW", 16);
setInput("fmtH", 9);
setSelect("format", "16:9");

/* ------------------- 6. export PNG ------------------- */

setSelect("format", "16:9");
downloads.length = 0;
$("export").dispatchEvent(new win.Event("click"));
eq("one file downloaded", downloads.length, 1);
eq("file name", downloads[0], "colorgrid_my-grid_9x5_d5_16x9_srgb_2048x1152.png");
eq("cells painted in the export", painted.fills.length, D().cols * D().rows);
ok("export info names the file", $("export-info").textContent.includes("colorgrid_my-grid"), $("export-info").textContent);
ok("the button finds back its label", $("export").textContent.includes("Export PNG"), $("export").textContent);

$("export-hex").checked = true;
$("export-hex").dispatchEvent(new win.Event("change"));
painted.texts.length = 0;
$("export").dispatchEvent(new win.Event("click"));
eq("codes painted when asked", painted.texts.length, D().cols * D().rows);
eq("name reports the space and the painted codes", (() => {
  win.__api.state.space = "oklab";
  $("space").value = "oklab";
  $("space").dispatchEvent(new win.Event("change"));
  downloads.length = 0;
  $("export").dispatchEvent(new win.Event("click"));
  return downloads[0];
})(), "colorgrid_my-grid_9x5_d5_16x9_oklab_hex_2048x1152.png");
$("export-hex").checked = false;
$("export-hex").dispatchEvent(new win.Event("change"));

/* the preview itself does not change space depending on the export */
setSelect("space", "srgb");

/* ------------------- 7. codes painted or hidden ------------------- */

painted.texts.length = 0;
setSelect("format", "1:1");
setInput("density", 5);
eq("codes painted in 5 x 5", painted.texts.length, 25);
setInput("density", 30);
eq("codes hidden in 30 x 30", painted.texts.length, 0);
ok("the summary says so", summary().includes("codes hidden"), summary());
setInput("density", 5);

/* ------------------- 8. clicks on the preview ------------------- */

const clickAt = (x, y, shift) => {
  const event = new win.MouseEvent("click", { clientX: x, clientY: y, shiftKey: !!shift, bubbles: true });
  $("grid").dispatchEvent(event);
};
const clearPoints = () => { api.state.points.length = 0; api.renderPoints(); };
cornerClicks.length = 0;
clips.length = 0;
clickAt(5, 5);                       // top left corner
eq("top left corner recognised", cornerClicks, ["topLeft"]);
eq("nothing copied for a corner", clips.length, 0);
cornerClicks.length = 0;
clickAt(695, 5);                     // top right corner
eq("top right corner recognised", cornerClicks, ["topRight"]);
cornerClicks.length = 0;
clickAt(5, 695);                     // bottom left corner
eq("bottom left corner recognised", cornerClicks, ["bottomLeft"]);
cornerClicks.length = 0;
clickAt(695, 695);                   // bottom right corner
eq("bottom right corner recognised", cornerClicks, ["bottomRight"]);
clips.length = 0;
clearPoints();
clickAt(350, 350);                   // centre: the default click places a control point
eq("a middle cell places a control point", api.state.points.length, 1);
eq("placed at the middle of the frame", [api.state.points[0].x, api.state.points[0].y], [0.5, 0.5]);
eq("nothing copied by that click", clips.length, 0);
ok("a row appears in the panel", doc.querySelectorAll(".point-item").length === 1, doc.querySelectorAll(".point-item").length);
ok("the point info names it", $("point-info").textContent.includes("1 control point"), $("point-info").textContent);

/* Shift+click keeps the old behaviour: copying the code, no point added */
clearPoints();
clips.length = 0;
clickAt(350, 350, true);
eq("Shift+click copies the code", clips.length, 1);
ok("the copied code is a HEX", /^#[0-9a-f]{6}$/i.test(clips[0]), clips[0]);
ok("the copied cell is shown below", $("picked").textContent.includes(clips[0].toUpperCase()), $("picked").textContent);
eq("Shift+click adds no point", api.state.points.length, 0);

/* clicking again on the very same cell updates the point instead of duplicating it */
clearPoints();
clickAt(350, 350);
clickAt(350, 350);
eq("the same spot is not duplicated", api.state.points.length, 1);

/* the tool tip says what a click would do */
ok("the tool tip announces the point", api.cellTitle(2, 2).includes("control point at 50% × 50%"), api.cellTitle(2, 2));
clearPoints();
ok("the tool tip announces the place", api.cellTitle(2, 2).includes("click to place a control point"), api.cellTitle(2, 2));

/* turning the box off brings the plain copy back */
$("pick-mode").checked = false;
$("pick-mode").dispatchEvent(new win.Event("change"));
clips.length = 0;
clearPoints();
clickAt(350, 350);
eq("box off: a click copies", clips.length, 1);
eq("box off: no point added", api.state.points.length, 0);
$("pick-mode").checked = true;
$("pick-mode").dispatchEvent(new win.Event("change"));

/* a 1 x 1 lattice: no editable corners, and no room for a control point */
setSelect("format", "custom");
setInput("fmtW", 32);
setInput("fmtH", 32);
setInput("density", 1);
eq("1 cell at density 1", [D().cols, D().rows], [1, 1]);
cornerClicks.length = 0;
clearPoints();
clickAt(16, 16);
eq("density 1: no editable corner", cornerClicks, []);
eq("density 1: the only cell is a corner, so no point", api.state.points.length, 0);
setSelect("format", "1:1");
setInput("density", 5);
clearPoints();

/* ------------------- 8b. control points inside the frame ------------------- */

/* the color asked for really is painted, right at the spot */
clearPoints();
clickAt(350, 350);
const before = api.cellMatrix().grid[2][2];
const swatch = doc.querySelector(".point-item .point-color");
ok("the row carries a color picker", swatch && swatch.type === "color", swatch && swatch.type);
swatch.value = "#000000";
swatch.dispatchEvent(new win.Event("input"));
eq("the cell of the point takes that color exactly", api.cellMatrix().grid[2][2], "#000000");
ok("neighbouring cells follow", api.cellMatrix().grid[2][1] !== before, api.cellMatrix().grid[2][1]);
ok("the corner keeps its color", api.cellMatrix().grid[0][0], "#ff0000");
ok("the hex label follows the picker", doc.querySelector(".point-item .point-hex").textContent === "#000000",
  doc.querySelector(".point-item .point-hex").textContent);

/* the hex label is refreshed without rebuilding the rows */
swatch.value = "#00ff00";
swatch.dispatchEvent(new win.Event("input"));
eq("one row still", doc.querySelectorAll(".point-item").length, 1);
eq("label updated in place", doc.querySelector(".point-item .point-hex").textContent, "#00FF00");

/* positions belong to the image, not to the lattice */
setInput("density", 9);
eq("density changes, the point stays", [api.state.points[0].x, api.state.points[0].y], [0.5, 0.5]);
eq("the point color still lands on a cell", api.cellMatrix().grid[4][4], "#00ff00");
setInput("density", 5);

setSelect("format", "16:9");
eq("format changes, the point stays", [api.state.points[0].x, api.state.points[0].y], [0.5, 0.5]);
setSelect("format", "1:1");

/* positions typed by hand in the panel */
const xField = doc.querySelectorAll(".point-item input[type=\"number\"]")[0];
const yField = doc.querySelectorAll(".point-item input[type=\"number\"]")[1];
eq("position shown in %", [xField.value, yField.value], ["50", "50"]);
xField.value = "25";
xField.dispatchEvent(new win.Event("change"));
yField.value = "75";
yField.dispatchEvent(new win.Event("change"));
eq("typed positions taken", [api.state.points[0].x, api.state.points[0].y], [0.25, 0.75]);
xField.value = "";
xField.dispatchEvent(new win.Event("change"));
eq("an empty position changes nothing", api.state.points[0].x, 0.25);
eq("the field is put back", xField.value, "25");

/* marks: rings and guide crosses, preview only */
painted.strokes.length = 0;
api.render();
ok("the point is ringed", painted.strokes.some((s) => s[2].includes("arc")), JSON.stringify(painted.strokes).slice(0, 120));
ok("the cross it opens is drawn", painted.strokes.some((s) => s[2].includes("move")), JSON.stringify(painted.strokes).slice(0, 120));

/* the ring sits on the cell that was clicked, not on the seam between cells */
clearPoints();
clickAt(210, 70);                       // top row, second cell of a 5 x 5 lattice
eq("the point stands on the sample of that cell", [api.state.points[0].x, api.state.points[0].y], [0.25, 0]);
eq("the cell clicked takes the color of the point", api.cellMatrix().grid[0][1], api.state.points[0].color);
painted.arcs.length = 0;
api.render();
const ring = painted.arcs[0];
ok("the ring is drawn at the middle of the cell clicked", ring && Math.abs(ring[0] - 210) < 1 && Math.abs(ring[1] - 70) < 1,
  JSON.stringify(painted.arcs));
$("mark-points").checked = false;
$("mark-points").dispatchEvent(new win.Event("change"));
painted.strokes.length = 0;
api.render();
ok("marks can be turned off", painted.strokes.length === 0, JSON.stringify(painted.strokes).slice(0, 120));
$("mark-points").checked = true;
$("mark-points").dispatchEvent(new win.Event("change"));

/* the export name says how many points the image holds */
ok("the file name mentions the points", api.exportName(2048, 2048).includes("_cp1_"), api.exportName(2048, 2048));

/* removing one */
doc.querySelector(".point-item .point-remove").click();
eq("the remove button removes the point", api.state.points.length, 0);
eq("the row is gone", doc.querySelectorAll(".point-item").length, 0);
ok("no mark left", (() => { painted.strokes.length = 0; api.render(); return painted.strokes.length === 0; })(), true);
ok("the file name drops the mention", !api.exportName(2048, 2048).includes("cp"), api.exportName(2048, 2048));

/* several points, and the ceiling */
clearPoints();
for (const [x, y] of [[210, 210], [350, 210], [210, 350], [350, 350], [490, 350]]) clickAt(x, y);
eq("five points kept", api.state.points.length, 5);
ok("the summary counts them", summary().includes("5 control points"), summary());
const lattice = api.currentRamp().lattice;
/* lattice nodes hold colors in the blending space: here sRGB, so plain 0..1 triplets */
const nodeHex = (t) => "#" + t.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255)
  .toString(16).padStart(2, "0")).join("");
eq("control columns opened in the lattice", lattice.xs.map((v) => Math.round(v * 100)), [0, 25, 50, 75, 100]);
eq("control rows opened in the lattice", lattice.ys.map((v) => Math.round(v * 100)), [0, 50, 75, 100]);
eq("the four corners keep their own color inside the lattice",
  [nodeHex(lattice.nodes[0][0]), nodeHex(lattice.nodes[0][4]), nodeHex(lattice.nodes[3][0]), nodeHex(lattice.nodes[3][4])],
  ["#0000ff", "#ffff00", "#ff0000", "#00ff00"]);
api.state.points[0].color = "#000000";
api.render();
eq("the imposed color stands on its node", nodeHex(api.currentRamp().lattice.nodes[2][1]), "#000000");
eq("the cell sampled there takes it exactly", api.cellMatrix().grid[1][1], "#000000");
ok("a corner cell is not painted over", api.cellMatrix().grid[0][0], "#ff0000");
clearPoints();
for (let i = 0; i < 40; i++) api.addPointAt(i % 5, (i % 4) + 1);
eq("points capped", api.state.points.length, api.MAX_POINTS);
clearPoints();

/* a damaged list is corrected or dropped, never trusted */
eq("points without a position are dropped", api.sanitizePointList([{ x: "a", y: 0.5, color: [1, 0, 0] }]), []);
eq("points without a color are dropped", api.sanitizePointList([{ x: 0.5, y: 0.5 }]), []);
eq("positions brought back inside the frame", api.sanitizePointList([{ x: 3, y: -2, color: [1, 0, 0] }]),
  [{ x: 1, y: 0, color: "#ff0000" }]);
eq("a color read as sRGB values", api.sanitizePointList([{ x: 0.5, y: 0.5, color: [0, 1, 0] }]),
  [{ x: 0.5, y: 0.5, color: "#00ff00" }]);

/* ------------------- 9. records ------------------- */

ok("no grid on the first launch", doc.querySelectorAll(".grid-item").length === 0);
ok("the list says so", $("grid-list").textContent.includes("No saved grids"), $("grid-list").textContent);

eq("unknown format falls back on square", api.configShape({ format: "21:10", density: 4 }).format, "1:1");
eq("missing density = 5", api.configShape({}).density, 5);
eq("nonsensical density corrected", api.configShape({ density: -12 }).density, 1);
eq("too large density corrected", api.configShape({ density: 999 }).density, api.DENSITY_CAP);
eq("lattice of a 16:9 record at density 7", (() => { const d = api.configDims({ format: "16:9", density: 7 }); return [d.cols, d.rows]; })(), [12, 7]);
eq("lattice of a custom record", (() => { const d = api.configDims({ format: "custom", frame_w: 3, frame_h: 2, density: 6 }); return [d.cols, d.rows]; })(), [9, 6]);
eq("custom ratio kept", (() => { const s = api.configShape({ format: "custom", frame_w: 4000, frame_h: 30 }); return s.ratio; })(), [400, 3]);
eq("lattice 4000x30 at density 5", (() => { const d = api.configDims({ format: "custom", frame_w: 4000, frame_h: 30, density: 5 }); return [d.cols, d.rows, d.density]; })(), [667, 5, 5]);
eq("extreme custom ratio brought back to 512:1", (() => { const s = api.configShape({ format: "custom", frame_w: 8192, frame_h: 16 }); return s.ratio; })(), [512, 1]);
eq("1920x1080 reduced to 16:9", api.approxRatio(1920, 1080, true), [16, 9, "16:9"]);

/* ------------------- 10. saving and reopening ------------------- */

setSelect("format", "16:9");
setInput("density", 7);
setSelect("space", "oklab");
clearPoints();
clickAt(350, 350);                      // 16:9 at density 7: 12 x 7 cells
doc.querySelector(".point-item .point-color").value = "#123456";
doc.querySelector(".point-item .point-color").dispatchEvent(new win.Event("input"));
$("grid-name").value = "Desk OkLab";
$("grid-name").dispatchEvent(new win.Event("input"));
$("save").dispatchEvent(new win.Event("click"));

const saved = JSON.parse(win.localStorage.getItem("color_grid.grids.v2"));
const record = saved["Desk OkLab"];
ok("record created", !!record);
eq("format stored", record.format, "16:9");
eq("density stored", record.density, 7);
eq("resolution stored", record.res, 2048);
eq("space stored", record.space, "oklab");
ok("corners stored as triplets", Array.isArray(record.color_top_left) && record.color_top_left.length === 3);
ok("the control point is stored", Array.isArray(record.points) && record.points.length === 1,
  JSON.stringify(record.points));
eq("its position stored as a fraction of the frame", Math.round(record.points[0].x * 1e6) / 1e6, 0.545455);
eq("its color stored as sRGB values", record.points[0].color.map((v) => Math.round(v * 255)), [0x12, 0x34, 0x56]);

const last = JSON.parse(win.localStorage.getItem("color_grid.current.v2"));
eq("last grid remembered", [last.format, last.density, last.space], ["16:9", 7, "oklab"]);

/* reopening: a new page reads the same storage */
const again = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, url: "http://localhost/" });
again.window.localStorage.setItem("color_grid.grids.v2", win.localStorage.getItem("color_grid.grids.v2"));
again.window.localStorage.setItem("color_grid.current.v2", win.localStorage.getItem("color_grid.current.v2"));
again.window.HTMLCanvasElement.prototype.getContext = () => fakeCtx;
Object.defineProperty(again.window.document.getElementById("frame"), "clientWidth", { value: 900 });
Object.defineProperty(again.window.document.getElementById("frame"), "clientHeight", { value: 700 });
runIn(again, sources);
const api2 = again.window.__api;
eq("format found back on reopening", api2.state.format, "16:9");
eq("density found back on reopening", api2.state.density, 7);
eq("space found back on reopening", api2.state.space, "oklab");
eq("lattice found back on reopening", [api2.dims().cols, api2.dims().rows], [12, 7]);
eq("control point found back on reopening", api2.state.points.length, 1);
eq("its color found back", api2.state.points[0].color, "#123456");
eq("its position found back", api2.state.points[0].x, 0.545455);
ok("the list mentions the control point", [...again.window.document.querySelectorAll(".grid-item")]
  .some((item) => item.textContent.includes("1 control point")),
  [...again.window.document.querySelectorAll(".grid-item")].map((i) => i.textContent).join(" | "));
eq("rows built on reopening", again.window.document.querySelectorAll(".point-item").length, 1);
ok("the list finds the grid back", [...again.window.document.querySelectorAll(".grid-item")]
  .some((item) => item.textContent.includes("12×7")), [...again.window.document.querySelectorAll(".grid-item")]
  .map((i) => i.textContent).join(" | "));

/* the keys of the previous version are wiped on load */
const legacyStore = JSON.stringify({
  "Old one": {
    grid_name: "Old one", cols: 13, rows: 8,
    color_top_left: [1, 0, 0], color_top_right: [0, 1, 0],
    color_bottom_left: [0, 0, 1], color_bottom_right: [1, 1, 0],
  },
  "NoFormat": {
    grid_name: "NoFormat", format: "21:10", density: 4,
    color_top_left: [1, 0, 0], color_top_right: [0, 1, 0],
    color_bottom_left: [0, 0, 1], color_bottom_right: [1, 1, 0],
  },
});
const third = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, url: "http://localhost/" });
third.window.localStorage.setItem("color_grid.grids.v1", legacyStore);
third.window.localStorage.setItem("color_grid.current.v1", legacyStore);
third.window.localStorage.setItem("color_grid.seeded.v1", "2024-01-01T00:00:00.000Z");
third.window.localStorage.setItem("color_grid.name", "Old one");
third.window.localStorage.setItem("color_grid.cols", "13");
third.window.HTMLCanvasElement.prototype.getContext = () => fakeCtx;
runIn(third, sources);
const api3 = third.window.__api;
ok("old keys wiped", third.window.localStorage.getItem("color_grid.grids.v1") === null);
ok("old density key wiped", third.window.localStorage.getItem("color_grid.cols") === null);
ok("old last-grid key wiped", third.window.localStorage.getItem("color_grid.current.v1") === null);
ok("the grids of the old version do not come back", api3.state.format === "1:1" && api3.state.density === 5,
  `${api3.state.format} ${api3.state.density}`);
ok("empty list after the wipe", third.window.document.querySelectorAll(".grid-item").length === 0);

/* a hand-written record, in the current shape, is loaded properly */
const hand = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, url: "http://localhost/" });
hand.window.localStorage.setItem("color_grid.grids.v2", legacyStore);
hand.window.HTMLCanvasElement.prototype.getContext = () => fakeCtx;
runIn(hand, sources);
const api4 = hand.window.__api;
const items4 = [...hand.window.document.querySelectorAll(".grid-item")].map((i) => i.textContent);
ok("hand-written records listed", items4.some((t) => t.includes("NoFormat")), items4.join(" | "));
ok("lattice announced in the list", items4.some((t) => /\d+×\d+/.test(t)), items4.join(" | "));
const openNoFormat = [...hand.window.document.querySelectorAll(".grid-item")]
  .find((i) => i.textContent.includes("NoFormat"));
openNoFormat.querySelector(".grid-open").dispatchEvent(new hand.window.Event("click"));
ok("unknown format falls back on square", api4.state.format === "1:1", api4.state.format);
eq("density kept", api4.state.density, 4);
eq("matching lattice", [api4.dims().cols, api4.dims().rows], [4, 4]);

/* a wholly nonsensical configuration does not break the opening */
const fifth = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, url: "http://localhost/" });
fifth.window.localStorage.setItem("color_grid.current.v2", JSON.stringify({
  grid_name: null, format: "??", density: -2, res: "x", space: "lab",
  frame_w: "lots", frame_h: [], color_top_left: [2, -1, "z"],
}));
fifth.window.HTMLCanvasElement.prototype.getContext = () => fakeCtx;
runIn(fifth, sources);
ok("nonsensical config: the page starts", !!fifth.window.__api);
ok("lattice corrected", fifth.window.__api.dims().cols >= 1 && fifth.window.__api.dims().rows >= 1,
  JSON.stringify(fifth.window.__api.dims()));
ok("default name", fifth.window.document.getElementById("grid-name").value === "My Grid",
  fifth.window.document.getElementById("grid-name").value);
ok("nonsensical color corrected", fifth.window.__api.state.colors.topLeft === "#ff0000",
  fifth.window.__api.state.colors.topLeft);

/* ------------------- 11. settings in the address ------------------- */
clearPoints();

const fresh = (url, seed) => {
  const page = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, url });
  if (seed) for (const [key, value] of Object.entries(seed)) page.window.localStorage.setItem(key, value);
  page.window.HTMLCanvasElement.prototype.getContext = () => fakeCtx;
  Object.defineProperty(page.window.document.getElementById("frame"), "clientWidth", { value: 900 });
  Object.defineProperty(page.window.document.getElementById("frame"), "clientHeight", { value: 700 });
  runIn(page, sources);
  return page;
};
const D5 = (page) => page.window.document;
const api6 = (page) => page.window.__api;

setSelect("format", "16:9");
setInput("fmtW", 16);
setInput("fmtH", 9);
setInput("density", 7);
setSelect("res", "1024");
setSelect("space", "oklch");
$("grid-name").value = "Link Test";
$("grid-name").dispatchEvent(new win.Event("input"));
$("show-hex").checked = false;
$("show-hex").dispatchEvent(new win.Event("change"));
$("export-hex").checked = true;
$("export-hex").dispatchEvent(new win.Event("change"));
setInput("c-top-left", "#112233");

const hashOf = (page) => (page.location ? page : win).location.hash.slice(1);
eq("the settings are in the address", hashOf(win),
  "F=16x9&fw=16&fh=9&n=7&rs=1024&sp=oklch&nm=Link%20Test&hx=0&ex=1&pm=1&mk=1&P=&c1=112233&c2=00ff00&c3=0000ff&c4=ffff00");
ok("the address is announced under the button", $("link-info").textContent.includes("F=16x9"), $("link-info").textContent);

setInput("density", 9);
ok("density changed: the address follows", win.location.hash.includes("&n=9&"), win.location.hash);
setSelect("format", "1:1");
ok("format changed: the address follows", win.location.hash.includes("F=1x1"), win.location.hash);
setSelect("space", "srgb");
ok("space changed: the address follows", win.location.hash.includes("sp=srgb"), win.location.hash);
setInput("c-top-right", "#0000cc");
ok("color changed: the address follows", win.location.hash.includes("c2=0000cc"), win.location.hash);
$("show-hex").checked = true;
$("show-hex").dispatchEvent(new win.Event("change"));
ok("boxes ticked: the address follows", win.location.hash.includes("hx=1"), win.location.hash);

clips.length = 0;
$("copy-link").dispatchEvent(new win.Event("click"));
ok("copy link: the full address is copied", clips.length === 1 && clips[0].startsWith("http://localhost/#F=1x1"), clips[0]);

/* an address read back must give exactly the same address: the encoding is stable */
const trip = win.location.hash.slice(1);
const reloaded = fresh(`http://localhost/#${trip}`);
eq("address read back identically", hashOf(reloaded.window), trip);
eq("settings read from the address", [reloaded.window.__api.state.format, reloaded.window.__api.state.density,
  reloaded.window.__api.state.res, reloaded.window.__api.state.space, reloaded.window.__api.state.name],
  ["1:1", 9, 1024, "srgb", "Link Test"]);

/* an address received: format, density, resolution, space, name, flags, colors */
const linked = fresh("http://localhost/#F=4x3&fw=16&fh=9&n=6&rs=3840&sp=hsl&nm=Sky%20%2B%20Sea&hx=0&ex=1&c1=ff8800&c2=0088ff&c3=222222&c4=eeddee");
const api5 = linked.window.__api;
eq("address received: format", api5.state.format, "4:3");
eq("address received: density", api5.state.density, 6);
eq("address received: resolution", api5.state.res, 3840);
eq("address received: space", api5.state.space, "hsl");
eq("address received: name", api5.state.name, "Sky + Sea");
eq("address received: lattice", [api5.dims().cols, api5.dims().rows], [8, 6]);
eq("address received: export size", api5.exportPx(), [3840, 2880]);
eq("address received: boxes ticked", [D5(linked).getElementById("show-hex").checked, D5(linked).getElementById("export-hex").checked], [false, true]);
eq("address received: color pickers filled", [D5(linked).getElementById("c-top-left").value, D5(linked).getElementById("c-bottom-right").value], ["#ff8800", "#eeddee"]);
eq("address received: name in the field", D5(linked).getElementById("grid-name").value, "Sky + Sea");
eq("address received: file name prepared", api5.exportName(...api5.exportPx()),
  "colorgrid_sky-sea_8x6_d6_4x3_hsl_hex_3840x2880.png");
ok("address received: the address stays the same", hashOf(linked.window) === "F=4x3&fw=16&fh=9&n=6&rs=3840&sp=hsl&nm=Sky%20%2B%20Sea&hx=0&ex=1&pm=1&mk=1&P=&c1=ff8800&c2=0088ff&c3=222222&c4=eeddee",
  hashOf(linked.window));

/* an address comes before the last grid opened */
const rival = fresh("http://localhost/#F=1x1&fw=16&fh=9&n=3&rs=2048&sp=srgb&nm=Bookmark&hx=1&ex=0&c1=ff0000&c2=00ff00&c3=0000ff&c4=ffff00", {
  "color_grid.current.v2": JSON.stringify({
    grid_name: "Other", format: "21:9", density: 11, frame_w: 16, frame_h: 9, res: 4096, space: "oklab",
    color_top_left: [0, 0, 0], color_top_right: [1, 1, 1], color_bottom_left: [0, 1, 0], color_bottom_right: [1, 0, 1],
  }),
});
ok("the address wins over the last grid opened", api6(rival).state.density === 3 && api6(rival).state.space === "srgb" && api6(rival).state.name === "Bookmark",
  JSON.stringify([api6(rival).state.density, api6(rival).state.space, api6(rival).state.name]));

/* a partial address: what is not in it keeps its default value */
const partial = fresh("http://localhost/#n=9");
eq("partial address: density applied", api6(partial).state.density, 9);
eq("partial address: the rest by default", [api6(partial).state.format, api6(partial).state.res, api6(partial).state.space, api6(partial).state.name],
  ["1:1", 2048, "srgb", "My Grid"]);
ok("partial address: rewritten complete", hashOf(partial.window).startsWith("F=1x1&fw=16&fh=9&n=9&rs=2048&sp=srgb"), hashOf(partial.window));

/* a nonsensical address breaks nothing: everything falls back on the defaults */
const junk = fresh("http://localhost/#F=%00&n=abc&sp=nope&c1=zzzz&rs=x&hx=notreally");
ok("nonsensical address: the page starts", !!api6(junk));
eq("nonsensical address: settings brought back to the defaults", [api6(junk).state.format, api6(junk).state.density,
  api6(junk).state.res, api6(junk).state.space, api6(junk).state.showHex], ["1:1", 5, 2048, "srgb", true]);
eq("nonsensical address: color kept", api6(junk).state.colors.topLeft, "#ff0000");

/* the query is readable too, even if it is the fragment that gets written */
const queried = fresh("http://localhost/?F=9x16&n=4");
eq("query accepted", [api6(queried).state.format, api6(queried).state.density], ["9:16", 4]);

/* custom size in the address: dimensions restored, file name without a doubled ratio */
const bespoke = fresh("http://localhost/#F=custom&fw=1920&fh=1080&n=5&rs=2048&sp=srgb&nm=Bespoke%20size&hx=1&ex=0&c1=ff0000&c2=00ff00&c3=0000ff&c4=ffff00");
eq("custom address: pixels taken as they are", api6(bespoke).exportPx(), [1920, 1080]);
eq("custom address: fields restored", [D5(bespoke).getElementById("fmtW").value, D5(bespoke).getElementById("fmtH").value], ["1920", "1080"]);
ok("custom address: fields shown", !D5(bespoke).getElementById("rowCustom").hidden);
eq("custom address: file name with no doubled ratio", api6(bespoke).exportName(...api6(bespoke).exportPx()),
  "colorgrid_bespoke-size_9x5_d5_srgb_1920x1080.png");

/* a name with no letters does not build a path into the file name */
const weird = fresh("http://localhost/#F=1x1&fw=16&fh=9&n=5&rs=1024&sp=srgb&nm=%2F%2F%20..&hx=1&ex=0&c1=ff0000&c2=00ff00&c3=0000ff&c4=ffff00");
const weirdName = api6(weird).exportName(...api6(weird).exportPx());
ok("file name with no path separator", !/[\\/]/.test(weirdName), weirdName);
ok("file name still complete", weirdName === "colorgrid_5x5_d5_1x1_srgb_1024x1024.png", weirdName);

/* control points in the address */
const pointed = fresh("http://localhost/#F=1x1&n=5&rs=1024&sp=srgb&nm=Pointed&P=25x50_00ff00*75x25_ff8800");
eq("address received: two control points", api6(pointed).state.points.length, 2);
eq("address received: first point", [api6(pointed).state.points[0].x, api6(pointed).state.points[0].y, api6(pointed).state.points[0].color], [0.25, 0.5, "#00ff00"]);
eq("address received: second point", [api6(pointed).state.points[1].x, api6(pointed).state.points[1].y, api6(pointed).state.points[1].color], [0.75, 0.25, "#ff8800"]);
ok("address received: the rows are built", pointed.window.document.querySelectorAll(".point-item").length === 2,
  pointed.window.document.querySelectorAll(".point-item").length);
ok("address received: the file name counts them", api6(pointed).exportName(...api6(pointed).exportPx()).includes("_cp2_"),
  api6(pointed).exportName(...api6(pointed).exportPx()));

eq("an empty P asks for no control point", api6(fresh("http://localhost/#F=1x1&n=5&rs=1024&sp=srgb&P=")).state.points.length, 0);
eq("a broken entry is dropped, the sound one kept",
  api6(fresh("http://localhost/#F=1x1&n=5&rs=1024&sp=srgb&P=25x50_00ff00*nonsense*50x50_zzzzzz")).state.points.length, 1);

/* a link written here is read back there: the whole round trip */
setSelect("format", "1:1");
setInput("density", 5);
clearPoints();
clickAt(350, 350);
doc.querySelector(".point-item .point-color").value = "#00ff00";
doc.querySelector(".point-item .point-color").dispatchEvent(new win.Event("input"));
const carriedHash = hashOf(win);
ok("the address carries the point", carriedHash.includes("P=50x50_00ff00"), carriedHash);
const carried = fresh("http://localhost/#" + carriedHash);
eq("round trip: the point comes back", api6(carried).state.points.length, 1);
eq("round trip: same position, same color", [api6(carried).state.points[0].x, api6(carried).state.points[0].y, api6(carried).state.points[0].color],
  [0.5, 0.5, "#00ff00"]);
eq("round trip: the cell of the point keeps the color", api6(carried).cellMatrix().grid[2][2], "#00ff00");
clearPoints();

/* the file name meant is announced before the export */
setSelect("format", "16:9");
setInput("density", 7);
setSelect("res", "2048");
setSelect("space", "srgb");
$("grid-name").value = "My Grid";
$("grid-name").dispatchEvent(new win.Event("input"));
$("export-hex").checked = false;
$("export-hex").dispatchEvent(new win.Event("change"));
ok("the file name meant is announced", $("export-info").textContent.includes("colorgrid_my-grid_12x7_d7_16x9_srgb_2048x1152.png"), $("export-info").textContent);


/* ------------------- 12. dragging a control point by its ring ------------------- */

const pointer = (type, x, y) => $("grid").dispatchEvent(
  new win.MouseEvent(type, { clientX: x, clientY: y, bubbles: true }));
const pointerWindow = (type, x, y) => win.dispatchEvent(
  new win.MouseEvent(type, { clientX: x, clientY: y, bubbles: true }));
const rowField = (n) => Number($("point-list").querySelectorAll(".point-item input")[n].value);

setSelect("format", "1:1");
setInput("density", 5);
setSelect("space", "srgb");
clearPoints();
$("mark-points").checked = true;
$("mark-points").dispatchEvent(new win.Event("change"));

/* a ring is painted on the cell that carries the color, not on the seam its point
   stands at: the two ways of mapping a cell must cancel each other out */
eq("ring centre = reverse of the sampling position", api.markSpot({ x: 0.25, y: 0 }), { x: 0.3, y: 0.1 });
eq("pointer position read back as a sampling position", api.sampleOf(0.3, 0.1), { x: 0.25, y: 0 });

clickAt(210, 70);                       // top row, second cell: a point at 25% x 0%
eq("a point placed by a click", [api.state.points[0].x, api.state.points[0].y], [0.25, 0]);

/* grabbing it where the ring is drawn */
pointer("pointerdown", 210, 70);
eq("the ring is grabbable", api.drag.index, 0);
pointerWindow("pointermove", 490, 350);      // middle right of the preview
eq("the point follows the pointer while dragging", [api.state.points[0].x, api.state.points[0].y], [0.75, 0.5]);
pointerWindow("pointerup", 490, 350);
eq("the drag is over", api.drag.index, -1);
eq("the point stays where it was dropped", [api.state.points[0].x, api.state.points[0].y], [0.75, 0.5]);
clickAt(490, 350);                       // the click a drag produces
eq("that click does not plant a second point", api.state.points.length, 1);
eq("the panel rows follow the drag", [rowField(1), rowField(2)], [75, 50]);

/* a ring never swallows a corner: dropped on one, the point goes back */
pointer("pointerdown", 490, 350);
pointerWindow("pointermove", 630, 630);      // bottom right corner of the lattice
pointerWindow("pointerup", 630, 630);
eq("a corner stays the property of its picker", [api.state.points[0].x, api.state.points[0].y], [0.75, 0.5]);
clickAt(630, 630);
eq("and the click after such a refusal is not lost either", api.state.points.length, 1);

/* released outside the preview: the point moved, and the next click is a real click */
clickAt(490, 350);
pointer("pointerdown", 490, 350);
pointerWindow("pointermove", 350, 490);
pointerWindow("pointerup", 900, 900);
eq("a point dropped outside still follows the pointer", [api.state.points[0].x, api.state.points[0].y], [0.5, 0.75]);
eq("no click left waiting", api.drag.awaited, false);
clickAt(210, 210);
eq("the next click works as usual", api.state.points.length, 2);

/* without marks there is no handle to grab: a click stays a click */
clearPoints();
$("mark-points").checked = false;
$("mark-points").dispatchEvent(new win.Event("change"));
pointer("pointerdown", 210, 70);
eq("no ring shown, nothing grabbed", api.drag.index, -1);
clickAt(210, 70);
eq("the click still places a control point", api.state.points.length, 1);
$("mark-points").checked = true;
$("mark-points").dispatchEvent(new win.Event("change"));

/* the cursor announces a ring under the pointer */
$("grid").dispatchEvent(new win.MouseEvent("mousemove", { clientX: 210, clientY: 70, bubbles: true }));
eq("a ring under the pointer offers itself to be moved", $("grid").style.cursor, "grab");
$("grid").dispatchEvent(new win.MouseEvent("mousemove", { clientX: 560, clientY: 560, bubbles: true }));
eq("elsewhere the cursor stays plain", $("grid").style.cursor, "");

clearPoints();

/* copy the palette */
clips.length = 0;
$("copy-palette").dispatchEvent(new win.Event("click"));
ok("palette copied", clips.length === 1 && clips[0].split(", ").length >= 4, clips[0]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;

/* matrix of the default grid, for the comparison with the Python reference */
setSelect("format", "1:1");
setInput("density", 5);
setSelect("space", "srgb");
for (const [id, value] of [["c-top-left", "#ff0000"], ["c-top-right", "#00ff00"],
  ["c-bottom-left", "#0000ff"], ["c-bottom-right", "#ffff00"]]) {
  setInput(id, value);
}
const { writeFileSync } = await import("node:fs");
writeFileSync(new URL("./matrix.json", import.meta.url), JSON.stringify(api.cellMatrix().grid));
