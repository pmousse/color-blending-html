/* probe: does the hue jump shrink when the field is sampled finer?
   a shrinking jump = a steep but continuous gradient;
   a jump that stays put = a real rupture line. */
"use strict";
const fs = require("fs");
const vm = require("vm");
const ROOT = require("path").resolve(__dirname, "..");
vm.runInThisContext(fs.readFileSync(ROOT + "/colorspaces.js", "utf8") + "\n; globalThis.ColorSpaces = ColorSpaces;");
const CS = globalThis.ColorSpaces;
const hex = (rgb) => "#" + rgb.map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, "0")).join("");
const hueOf = (space, p) => (space === "hsl" || space === "hsv") ? p[0] : p[2];

const corners = { bottomLeft: "#0000ff", bottomRight: "#ffff00", topLeft: "#ff0000", topRight: "#00ff00" };
const points = [{ x: 0.5, y: 0.5, color: "#00ff00" }, { x: 0.2, y: 0.8, color: "#ff0000" }];

for (const space of ["oklch", "hsl", "hsv"]) {
  const sp = CS.SPACES[space];
  const ramp = CS.makeRamp(space, corners, points);
  console.log("\n==", space, "lattice xs:", ramp.lattice.xs, "ys:", ramp.lattice.ys);
  for (const N of [21, 41, 81, 161]) {
    let worst = 0, at = null;
    for (let row = 0; row < N; row++) {
      for (let col = 0; col < N - 1; col++) {
        const x0 = col / (N - 1), x1 = (col + 1) / (N - 1), y = 1 - row / (N - 1);
        const h0 = hueOf(space, sp.from(ramp(x0, y)));
        const h1 = hueOf(space, sp.from(ramp(x1, y)));
        let g = Math.abs(h1 - h0); if (g > 180) g = 360 - g;
        if (g > worst) { worst = g; at = [x0.toFixed(3), y.toFixed(3), h0.toFixed(1), h1.toFixed(1)]; }
      }
    }
    let worstV = 0, atV = null;
    for (let col = 0; col < N; col++) {
      for (let row = 0; row < N - 1; row++) {
        const x = col / (N - 1), y0 = 1 - row / (N - 1), y1 = 1 - (row + 1) / (N - 1);
        const h0 = hueOf(space, sp.from(ramp(x, y0)));
        const h1 = hueOf(space, sp.from(ramp(x, y1)));
        let g = Math.abs(h1 - h0); if (g > 180) g = 360 - g;
        if (g > worstV) { worstV = g; atV = [x.toFixed(3), y0.toFixed(3), h0.toFixed(1), h1.toFixed(1)]; }
      }
    }
    console.log(`N=${N}  horizontal worst ${worst.toFixed(1)} at ${at}   vertical worst ${worstV.toFixed(1)} at ${atV}`);
  }
  console.log("node hues:", ramp.lattice.nodes.map((line) => line.map((n) => hueOf(space, n).toFixed(0)).join(" ")).join(" | "));
}
