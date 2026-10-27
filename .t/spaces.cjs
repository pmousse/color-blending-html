/* Color math tests: corners intact, continuous hue field, deterministic
   unwrapping, gray corners handled.  node .t/spaces.cjs */
"use strict";
const fs = require("fs");
const vm = require("vm");

const ROOT = require("path").resolve(__dirname, "..");
vm.runInThisContext(fs.readFileSync(ROOT + "/colorspaces.js", "utf8") + "\n; globalThis.ColorSpaces = ColorSpaces;");
const CS = globalThis.ColorSpaces;

let ok = 0, ko = 0;
function check(name, cond, detail) {
  if (cond) { ok++; } else { ko++; console.log("FAIL:", name, detail || ""); }
}
const hex = (rgb) => "#" + rgb.map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, "0")).join("");
const names = CS.spaceNames();

/* --- 1. the 4 corners stay exact in every space --- */
const sets = [
  { bottomLeft: "#0000ff", bottomRight: "#ffff00", topLeft: "#ff0000", topRight: "#00ff00" },
  { bottomLeft: "#000000", bottomRight: "#ffffff", topLeft: "#ffffff", topRight: "#000000" },
  { bottomLeft: "#808080", bottomRight: "#ff0000", topLeft: "#808080", topRight: "#00ff00" },
  { bottomLeft: "#1a2b3c", bottomRight: "#c0d1e2", topLeft: "#ff8800", topRight: "#002244" },
  { bottomLeft: "#ffffff", bottomRight: "#ffffff", topLeft: "#ffffff", topRight: "#ffffff" },
  { bottomLeft: "#000000", bottomRight: "#000000", topLeft: "#000000", topRight: "#000000" },
  { bottomLeft: "#ff0000", bottomRight: "#00ff00", topLeft: "#0000ff", topRight: "#ffff00" },
  { bottomLeft: "#ff0000", bottomRight: "#ff0000", topLeft: "#ff0000", topRight: "#ff0000" },
];
for (const space of names) {
  for (const corners of sets) {
    const ramp = CS.makeRamp(space, corners);
    check("corner " + space + " " + JSON.stringify(corners),
      hex(ramp(0, 1)) === corners.topLeft && hex(ramp(1, 1)) === corners.topRight &&
      hex(ramp(0, 0)) === corners.bottomLeft && hex(ramp(1, 0)) === corners.bottomRight,
      [hex(ramp(0, 1)), hex(ramp(1, 1)), hex(ramp(0, 0)), hex(ramp(1, 0))].join(" "));
  }
}

/* --- 2. no brutal hue jump between two neighbouring cells ---
   The reported bug: mixing "by the shortest path" at every step of the
   bilinear pass made the hue jump by about 180 degrees between two cells. */
const wheel = { bottomLeft: "#0000ff", bottomRight: "#ffff00", topLeft: "#ff0000", topRight: "#00ff00" };
const hueOf = (space, p) => (space === "hsl" || space === "hsv") ? p[0] : p[2];

for (const space of ["oklch", "hsl", "hsv"]) {
  const sp = CS.SPACES[space];
  const [BL, BR, TL, TR] = CS.makeRamp(space, wheel).points;
  const N = 21;
  const field = [];
  for (let row = 0; row < N; row++) {
    const line = [];
    for (let col = 0; col < N; col++) {
      const x = col / (N - 1), y = 1 - row / (N - 1);
      line.push(sp.mix(sp.mix(BL, BR, x), sp.mix(TL, TR, x), y));
    }
    field.push(line);
  }
  let worst = 0;
  for (let row = 0; row < N; row++) {
    for (let col = 0; col < N; col++) {
      for (const [dr, dc] of [[0, 1], [1, 0]]) {
        const r2 = row + dr, c2 = col + dc;
        if (r2 >= N || c2 >= N) continue;
        worst = Math.max(worst, Math.abs(hueOf(space, field[row][col]) - hueOf(space, field[r2][c2])));
      }
    }
  }
  check("continuous hue in " + space + " (" + worst.toFixed(1) + " degrees max)", worst < 25, "jump " + worst.toFixed(1));

  /* the unwrap kept is the cheapest one: the fewest degrees travelled in total
     over the 4 sides, among all the possible unwraps */
  const hues = [TL, TR, BR, BL].map((p) => hueOf(space, p));
  const cost = (v) => v.reduce((s, h, i) => s + Math.pow(v[(i + 1) % 4] - h, 2), 0);
  let best = Infinity;
  for (let a = -2; a <= 2; a++) {
    for (let b = -2; b <= 2; b++) {
      for (let c = -2; c <= 2; c++) {
        for (let d = -2; d <= 2; d++) {
          best = Math.min(best, cost([hues[0] + 360 * a, hues[1] + 360 * b, hues[2] + 360 * c, hues[3] + 360 * d]));
        }
      }
    }
  }
  check("optimal hue unwrap in " + space, Math.abs(cost(hues) - best) < 1e-6,
    cost(hues).toFixed(0) + " against " + best.toFixed(0));
  check("hue span kept within bounds in " + space,
    Math.max(...hues) - Math.min(...hues) <= 240,
    (Math.max(...hues) - Math.min(...hues)).toFixed(1));
}

/* --- 3. the unwrap is deterministic, asked twice it gives the same image --- */
for (const space of names) {
  const a = CS.makeRamp(space, wheel);
  const b = CS.makeRamp(space, wheel);
  let identical = true;
  for (let i = 0; i <= 10; i++) {
    for (let j = 0; j <= 10; j++) {
      if (hex(a(i / 10, j / 10)) !== hex(b(i / 10, j / 10))) identical = false;
    }
  }
  check("stable ramp in " + space, identical);
}

/* --- 4. a gray corner does not force a hue on the rest of the image --- */
{
  /* left half gray, right half blue -> red: the hue has to follow the
     blue/red, not swing towards the red of the corners that carry no hue */
  const corners = { bottomLeft: "#808080", topLeft: "#808080", bottomRight: "#0000ff", topRight: "#ff0000" };
  for (const space of ["oklch", "hsl", "hsv"]) {
    const sp = CS.SPACES[space];
    const ramp = CS.makeRamp(space, corners);

    /* the hue the gray corners borrow: the mean of blue and red */
    const blue = hueOf(space, sp.from([0, 0, 1]));
    const red = hueOf(space, sp.from([1, 0, 0]));
    let x = Math.cos(blue * Math.PI / 180) + Math.cos(red * Math.PI / 180);
    let y = Math.sin(blue * Math.PI / 180) + Math.sin(red * Math.PI / 180);
    const mean = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;

    const leftSide = ramp(0.25, 0.5);
    const leftHue = hueOf(space, sp.from(leftSide));
    let gap = Math.abs(leftHue - mean);
    if (gap > 180) gap = 360 - gap;
    check("gray corner: the hue follows the other corners in " + space + " (" + hex(leftSide) + ", " + leftHue.toFixed(0) + " degrees, expected near " + mean.toFixed(0) + ")", gap < 45, hex(leftSide));
    check("gray corner: the corners stay exact in " + space,
      hex(ramp(0, 1)) === "#808080" && hex(ramp(1, 1)) === "#ff0000" &&
      hex(ramp(0, 0)) === "#808080" && hex(ramp(1, 0)) === "#0000ff");
  }
}

/* --- 5. a two-hue mix (the common case) stays on the shortest path --- */
{
  /* top red / green, bottom the same: only the short path is possible */
  const corners = { bottomLeft: "#ff0000", bottomRight: "#00ff00", topLeft: "#ff0000", topRight: "#00ff00" };
  for (const space of ["oklch", "hsl", "hsv"]) {
    const ramp = CS.makeRamp(space, corners);
    const [BL, BR, TL, TR] = ramp.points;
    const gap = Math.abs(hueOf(space, BR) - hueOf(space, BL));
    check("red -> green: the shortest path in " + space + " (" + gap.toFixed(1) + " degrees)", gap <= 180);
  }
  /* red / blue: through magenta, never through cyan */
  const corners2 = { bottomLeft: "#ff0000", bottomRight: "#0000ff", topLeft: "#ff0000", topRight: "#0000ff" };
  for (const space of ["oklch", "hsl", "hsv"]) {
    const middle = hex(CS.makeRamp(space, corners2)(0.5, 0.5));
    const r = parseInt(middle.slice(1, 3), 16), b = parseInt(middle.slice(5, 7), 16);
    const g = parseInt(middle.slice(3, 5), 16);
    check("red -> blue: goes through magenta in " + space + " (" + middle + ")", r > g && b > g, middle);
  }
}

/* --- 6. control points inside the frame --- */
{
  const corners = { bottomLeft: "#0000ff", bottomRight: "#ffff00", topLeft: "#ff0000", topRight: "#00ff00" };
  const samples = [[0, 0], [1, 1], [0.5, 0.5], [0.25, 0.75], [0.7, 0.3], [0.11, 0.9], [0.5, 0], [0, 0.5]];

  /* no control point at all: the very same field as before the feature existed */
  for (const space of names) {
    const plain = CS.makeRamp(space, corners);
    const empty = CS.makeRamp(space, corners, []);
    const same = samples.every(([x, y]) => hex(plain(x, y)) === hex(empty(x, y)));
    check("no control point: identical to a plain grid in " + space, same);
  }

  /* the corners keep their color even when points are set */
  const twoPoints = [{ x: 0.25, y: 0.75, color: "#000000" }, { x: 0.7, y: 0.3, color: "#00ff00" }];
  for (const space of names) {
    const ramp = CS.makeRamp(space, corners, twoPoints);
    check("corners kept with control points in " + space,
      hex(ramp(0, 1)) === corners.topLeft && hex(ramp(1, 1)) === corners.topRight &&
      hex(ramp(0, 0)) === corners.bottomLeft && hex(ramp(1, 0)) === corners.bottomRight,
      [hex(ramp(0, 1)), hex(ramp(1, 1)), hex(ramp(0, 0)), hex(ramp(1, 0))].join(" "));
  }

  /* the color asked for is painted exactly where it stands */
  for (const space of names) {
    const ramp = CS.makeRamp(space, corners, twoPoints);
    check("the imposed colors are honoured exactly in " + space,
      hex(ramp(0.25, 0.75)) === "#000000" && hex(ramp(0.7, 0.3)) === "#00ff00",
      [hex(ramp(0.25, 0.75)), hex(ramp(0.7, 0.3))].join(" "));
  }

  /* a point set on a corner never replaces that corner */
  for (const space of names) {
    const ramp = CS.makeRamp(space, corners, [
      { x: 0, y: 0, color: "#000000" }, { x: 1, y: 1, color: "#ffffff" },
      { x: 0, y: 1, color: "#ffffff" }, { x: 1, y: 0, color: "#000000" },
    ]);
    check("a control point cannot replace a corner in " + space,
      hex(ramp(0, 1)) === corners.topLeft && hex(ramp(1, 1)) === corners.topRight &&
      hex(ramp(0, 0)) === corners.bottomLeft && hex(ramp(1, 0)) === corners.bottomRight,
      [hex(ramp(0, 1)), hex(ramp(1, 1)), hex(ramp(0, 0)), hex(ramp(1, 0))].join(" "));
  }

  /* the field stays continuous around a point, in the spaces built on a hue.
   A rupture line would show the same jump whatever the sampling. Here the jump
   shrinks exactly as fast as the sampling gets finer: that is a continuous
   gradient, only steeper near a point — a point asks for a color the plain
   gradient did not have there. */
  for (const space of ["oklch", "hsl", "hsv"]) {
    const sp = CS.SPACES[space];
    const ramp = CS.makeRamp(space, corners, [{ x: 0.5, y: 0.5, color: "#00ff00" }, { x: 0.2, y: 0.8, color: "#ff0000" }]);

    const worstJump = (N) => {
      let worst = 0, where = "";
      for (let row = 0; row < N; row++) {
        for (let col = 0; col < N; col++) {
          const x = col / (N - 1), y = 1 - row / (N - 1);
          const here = hueOf(space, sp.from(ramp(x, y)));
          if (col + 1 < N) {
            const right = hueOf(space, sp.from(ramp((col + 1) / (N - 1), y)));
            let gap = Math.abs(right - here); if (gap > 180) gap = 360 - gap;
            if (gap > worst) { worst = gap; where = `column ${col} -> ${col + 1}`; }
          }
          if (row + 1 < N) {
            const below = hueOf(space, sp.from(ramp(x, 1 - (row + 1) / (N - 1))));
            let gap = Math.abs(below - here); if (gap > 180) gap = 360 - gap;
            if (gap > worst) { worst = gap; where = `row ${row} -> ${row + 1}`; }
          }
        }
      }
      return { worst, where };
    };

    const coarse = worstJump(21);
    const middle = worstJump(43);
    const fine = worstJump(87);
    check("control points: sampled 4 times finer, the jump shrinks just as much in " + space
      + ` (${coarse.worst.toFixed(1)}° at 21 samples -> ${fine.worst.toFixed(1)}° at 87 samples)`,
      fine.worst <= coarse.worst / 3.5, `${coarse.worst.toFixed(1)} -> ${middle.worst.toFixed(1)} -> ${fine.worst.toFixed(1)} at ${fine.where}`);
    check("control points: the gradient stays soft cell by cell in " + space + " (" + fine.worst.toFixed(1) + "°)",
      fine.worst < 12, fine.worst.toFixed(1));
  }

  /* a gray, black or white point does not bring its hueless default along: it takes
     the hue of the field it lands in */
  for (const space of ["oklch", "hsl", "hsv"]) {
    const sp = CS.SPACES[space];
    const plain = CS.makeRamp(space, corners);
    const withGray = CS.makeRamp(space, corners, [{ x: 0.5, y: 0.5, color: "#808080" }]);
    /* on both sides of the gray point the field must stay as plain as it was */
    let drift = 0;
    for (const [x, y] of [[0.45, 0.5], [0.55, 0.5], [0.5, 0.45], [0.5, 0.55]]) {
      const a = hueOf(space, sp.from(plain(x, y)));
      const b = hueOf(space, sp.from(withGray(x, y)));
      let gap = Math.abs(a - b);
      if (gap > 180) gap = 360 - gap;
      drift = Math.max(drift, gap);
    }
    const middle = hex(withGray(0.5, 0.5));
    check("a gray point follows the hue around it in " + space + " (drift " + drift.toFixed(1) + " degrees, " + middle + ")", drift < 30, drift.toFixed(1));
    check("a gray point still imposes its gray in " + space, middle === "#808080", middle);
  }

  /* the same points, the same colors: the same image, twice */
  for (const space of names) {
    const a = CS.makeRamp(space, corners, twoPoints);
    const b = CS.makeRamp(space, corners, twoPoints.slice().reverse());
    const same = samples.every(([x, y]) => hex(a(x, y)) === hex(b(x, y)));
    check("the order the points are given in changes nothing in " + space, same,
      samples.map(([x, y]) => hex(a(x, y)) + "/" + hex(b(x, y))).join(" "));
  }

  /* damaged points are left out rather than breaking the grid */
  for (const space of names) {
    const plain = CS.makeRamp(space, corners);
    const broken = CS.makeRamp(space, corners, [null, { x: NaN, y: 0.5, color: "#ff0000" }, { x: 0.5, y: "a", color: "#ff0000" }]);
    const same = samples.every(([x, y]) => hex(plain(x, y)) === hex(broken(x, y)));
    check("damaged control points are left out in " + space, same);
  }
}

console.log(`${ok} passed, ${ko} failed`);
process.exit(ko ? 1 : 0);
