/* Diagnostic for the spaces that carry a hue: unwrapping the corners, continuity
   of the field, corners intact */
const fs = require("fs");
const vm = require("vm");

vm.runInThisContext(fs.readFileSync("./colorspaces.js", "utf8") + "\n; globalThis.ColorSpaces = ColorSpaces;");
const CS = globalThis.ColorSpaces;

const corners = {
  bottomLeft: "#0000ff", bottomRight: "#ffff00",
  topLeft: "#ff0000", topRight: "#00ff00",
};

const hueOf = (space, p) => (space === "hsl" || space === "hsv") ? p[0] : p[2];

function hex(rgb) {
  return "#" + rgb.map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, "0")).join("");
}

for (const space of ["oklch", "hsl", "hsv"]) {
  const sp = CS.SPACES[space];
  const ramp = CS.makeRamp(space, corners);
  const [BL, BR, TL, TR] = ramp.points;

  console.log(`\n${space} — unwrapped hues: top left ${hueOf(space, TL).toFixed(1)}, top right ${hueOf(space, TR).toFixed(1)}, bottom left ${hueOf(space, BL).toFixed(1)}, bottom right ${hueOf(space, BR).toFixed(1)}`);
  console.log(`  gap per side: top ${(hueOf(space, TR) - hueOf(space, TL)).toFixed(1)}, left ${(hueOf(space, TL) - hueOf(space, BL)).toFixed(1)}, bottom ${(hueOf(space, BR) - hueOf(space, BL)).toFixed(1)}, right ${(hueOf(space, TR) - hueOf(space, BR)).toFixed(1)}`);

  /* corners rendered: they have to be exact */
  console.log("  corners rendered:", hex(ramp(0, 1)), hex(ramp(1, 1)), hex(ramp(0, 0)), hex(ramp(1, 0)),
    "(expected", corners.topLeft, corners.topRight, corners.bottomLeft, corners.bottomRight + ")");

  /* continuity: largest hue gap between two neighbouring cells */
  const N = 13;
  const field = [];
  for (let row = 0; row < N; row++) {
    const line = [];
    for (let col = 0; col < N; col++) {
      const x = col / (N - 1), y = 1 - row / (N - 1);
      line.push(sp.mix(sp.mix(BL, BR, x), sp.mix(TL, TR, x), y));
    }
    field.push(line);
  }
  let worst = 0, at = "";
  for (let row = 0; row < N; row++) {
    for (let col = 0; col < N; col++) {
      for (const [dr, dc] of [[0, 1], [1, 0]]) {
        const r2 = row + dr, c2 = col + dc;
        if (r2 >= N || c2 >= N) continue;
        const d = Math.abs(hueOf(space, field[row][col]) - hueOf(space, field[r2][c2]));
        if (d > worst) { worst = d; at = `(${row},${col}) -> (${r2},${c2}) : ${hueOf(space, field[row][col]).toFixed(0)} -> ${hueOf(space, field[r2][c2]).toFixed(0)}`; }
      }
    }
  }
  console.log(`  largest hue jump between neighbouring cells: ${worst.toFixed(1)} degrees ${at}`);
  console.log("  hues of the middle row:", field[6].map((p) => Math.round(hueOf(space, p))).join(" "));
  console.log("  hues of column 3     :", field.map((l) => Math.round(hueOf(space, l[3]))).join(" "));
  console.log("  5x5 render:", [0, 1, 2, 3, 4].map((row) => [0, 1, 2, 3, 4].map((col) => hex(ramp(col / 4, 1 - row / 4))).join(" ")).join("  |  "));
}
