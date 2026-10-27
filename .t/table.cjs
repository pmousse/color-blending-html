/* Table for the README: midpoint of each edge and the centre of the field, in
   every blending space. Corners: blue / yellow / red / green. */
const fs = require("fs"), vm = require("vm");
const ROOT = require("path").resolve(__dirname, "..");
vm.runInThisContext(fs.readFileSync(ROOT + "/colorspaces.js", "utf8") + "\n; globalThis.ColorSpaces = ColorSpaces;");
const CS = globalThis.ColorSpaces;
const corners = { bottomLeft: "#0000ff", bottomRight: "#ffff00", topLeft: "#ff0000", topRight: "#00ff00" };
const hex = (rgb) => "#" + rgb.map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, "0")).join("");

const spots = [[0.5, 1], [0, 0.5], [0.5, 0], [1, 0.5], [0.5, 0.5]];
const headers = ["top (red/green)", "left (blue/red)", "bottom (blue/yellow)", "right (green/yellow)", "centre"];

console.log("space  ".padEnd(8) + headers.map((h) => h.padEnd(24)).join(""));
for (const name of CS.spaceNames()) {
  const ramp = CS.makeRamp(name, corners);
  console.log(name.padEnd(8) +
    spots.map(([x, y]) => hex(ramp(x, y)).padEnd(24)).join(""));
}
