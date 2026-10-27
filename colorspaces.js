"use strict";

/* ==========================================================================
   colorspaces.js — the spaces in which the 4 corner colors — and the control
   points added inside the frame — are blended.

   Corners stay stored as sRGB (HEX codes, what the color pickers produce and
   what gets copied). Only the BLENDING changes space: the 4 corners are
   converted once into the chosen space, the bilinear interpolation runs inside
   that space, then the result comes back to sRGB.

   Doing the whole interpolation in the target space — instead of a round trip
   at every step — avoids accumulated rounding errors.

   Nothing here is global except `ColorSpaces`, to avoid any name collision
   with app.js.
   ========================================================================== */

const ColorSpaces = (() => {

  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const clampTriplet = (c) => [clamp01(c[0]), clamp01(c[1]), clamp01(c[2])];

  /* a corner may be given as HEX ("#ff0000", as in app.js) or already as 0..1
     triplets: both are accepted */
  function toTriplet(color) {
    if (Array.isArray(color)) return clampTriplet(color);
    let h = String(color || "").replace("#", "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return [0, 0, 0];
    const n = parseInt(h, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  /* --- sRGB transfer function ---
     a display code 0..1 -> light energy 0..1, and back */
  const srgbToLinear = (c) =>
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

  const linearToSrgb = (c) =>
    c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;

  /* --- OkLab / OkLch (Björn Ottosson) ---
     Perceptual space: an equal numerical distance there equals an equal perceived
     difference; L is perceived lightness, not energy.

     The forward matrices are the published OkLab ones (the ones CSS gives:
     oklab(62.796% 0.22486 0.12585) for #FF0000). The backward matrices are
     computed here from them: the published forward/backward constants are not
     exact inverses of each other, and the gap — tiny in linear light — becomes
     visible once you head back towards black. An exact round trip guarantees
     that the 4 corners come out intact. */
  const M_LMS = [
    0.4122214708, 0.5363325363, 0.0514459929,
    0.2119034982, 0.6806995451, 0.1073969566,
    0.0883024619, 0.2817188376, 0.6299787005,
  ];
  const M_LAB = [
    0.2104542553, 0.7936177850, -0.0040720468,
    1.9779984951, -2.4285922050, 0.4505937026,
    0.0259040371, 0.7827717662, -0.8086757660,
  ];

  function inverse3(M) {
    const [a, b, c, d, e, f, g, h, i] = M;
    const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
    return [
      (e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det,
      (f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det,
      (d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det,
    ];
  }

  const M_LMS_BACK = inverse3(M_LMS);
  const M_LAB_BACK = inverse3(M_LAB);

  const mul3 = (M, v) => [
    M[0] * v[0] + M[1] * v[1] + M[2] * v[2],
    M[3] * v[0] + M[4] * v[1] + M[5] * v[2],
    M[6] * v[0] + M[7] * v[1] + M[8] * v[2],
  ];

  function linearToOklab(rgb) {
    const lms = mul3(M_LMS, rgb).map(Math.cbrt);
    return mul3(M_LAB, lms);
  }

  function oklabToLinear(lab) {
    const lms = mul3(M_LAB_BACK, lab).map((v) => v * v * v);
    return mul3(M_LMS_BACK, lms);
  }

  const oklabToOklch = (lab) => {
    const chroma = Math.hypot(lab[1], lab[2]);
    const hue = chroma < 1e-9 ? 0 : (Math.atan2(lab[2], lab[1]) * 180 / Math.PI + 360) % 360;
    return [lab[0], chroma, hue];
  };

  const oklchToOklab = (lch) => {
    const angle = lch[2] * Math.PI / 180;
    return [lch[0], lch[1] * Math.cos(angle), lch[1] * Math.sin(angle)];
  };

  /* --- HSL / HSV: hue in degrees 0..360 --- */
  function toHue(r, g, b, chroma) {
    let h;
    if (chroma < 1e-9) return 0;
    const max = Math.max(r, g, b);
    if (max === r) h = ((g - b) / chroma) % 6;
    else if (max === g) h = (b - r) / chroma + 2;
    else h = (r - g) / chroma + 4;
    return (h * 60 + 360) % 360;
  }

  function hueSector(h, chroma) {
    const x = chroma * (1 - Math.abs((h / 60) % 2 - 1));
    if (h < 60) return [chroma, x, 0];
    if (h < 120) return [x, chroma, 0];
    if (h < 180) return [0, chroma, x];
    if (h < 240) return [0, x, chroma];
    if (h < 300) return [x, 0, chroma];
    return [chroma, 0, x];
  }

  function rgbToHsl(rgb) {
    const [r, g, b] = rgb;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), chroma = max - min;
    const hue = toHue(r, g, b, chroma);
    const light = (max + min) / 2;
    const sat = chroma === 0 ? 0 : chroma / (1 - Math.abs(2 * light - 1));
    return [hue, sat, light];
  }

  function hslToRgb(hsl) {
    const [hue, sat, light] = hsl;
    const chroma = (1 - Math.abs(2 * light - 1)) * sat;
    const m = light - chroma / 2;
    return hueSector(hue, chroma).map((v) => v + m);
  }

  function rgbToHsv(rgb) {
    const [r, g, b] = rgb;
    const max = Math.max(r, g, b), chroma = max - Math.min(r, g, b);
    return [toHue(r, g, b, chroma), max === 0 ? 0 : chroma / max, max];
  }

  function hsvToRgb(hsv) {
    const [hue, sat, value] = hsv;
    const chroma = value * sat;
    const m = value - chroma;
    return hueSector(hue, chroma).map((v) => v + m);
  }

  const normalizeHue = (h) => ((h % 360) + 360) % 360;

  /* --- Hue: unwrapping the color wheel once ---
     Hue is a circular coordinate. Blending it "by the shortest path" at every
     bilinear step makes the blend path dependent, and the hue field starts
     jumping by nearly 180 degrees between neighbouring cells as soon as the 4
     corners run around the whole wheel (red top left, green top right, blue
     bottom left, yellow bottom right): a rupture line plainly visible in the
     image.

     A continuous hue field cannot take the shortest path on all four sides at
     once — that is a property of the circle, not a choice. So: the 4 corner
     hues are unfolded once into continuous values (each brought back within
     360 degrees), and the whole interpolation then stays within those numbers,
     with no return to the circle along the way. The unfolding kept is the one
     that moves the fewest degrees in total along the 4 sides, and it is
     deterministic: a saved grid always gives the same image back. The price is
     that one side may go the long way round. */
  function unwrapHues(hTL, hTR, hBR, hBL) {
    /* the order follows the sides of the frame: top left -> top right ->
       bottom right -> bottom left -> back to the start */
    let best = [hTL, hTR, hBR, hBL], bestCost = Infinity;
    for (let a = -1; a <= 1; a++) {
      for (let b = -1; b <= 1; b++) {
        for (let c = -1; c <= 1; c++) {
          for (let d = -1; d <= 1; d++) {
            const v = [hTL + 360 * a, hTR + 360 * b, hBR + 360 * c, hBL + 360 * d];
            let cost = 0;
            for (let e = 0; e < 4; e++) {
              const delta = v[(e + 1) % 4] - v[e];
              cost += delta * delta;
            }
            if (cost < bestCost - 1e-9) { bestCost = cost; best = v; }
          }
        }
      }
    }
    return best;
  }

  const mixComponents = (a, b, t) => a.map((v, i) => v + t * (b[i] - v));

  /* The four corners, in the order [bottom left, bottom right, top left,
     top right]: hues unfolded into continuous values, hues of gray corners
     borrowed from the other corners. Returns a copy, the originals are untouched. */
  function unwrapCorners(points, hueIndex, chromaIndex) {
    const pts = points.map((p) => p.slice());
    const colored = pts.filter((p) => Math.abs(p[chromaIndex]) > 1e-4);

    if (colored.length > 0 && colored.length < 4) {
      /* gray, black and white have no hue: they borrow the average hue of the
         other corners, otherwise they would force red into the gradient */
      let x = 0, y = 0;
      for (const p of colored) {
        const angle = p[hueIndex] * Math.PI / 180;
        x += Math.cos(angle);
        y += Math.sin(angle);
      }
      const mean = normalizeHue(Math.atan2(y, x) * 180 / Math.PI);
      for (const p of pts) if (Math.abs(p[chromaIndex]) <= 1e-4) p[hueIndex] = mean;
    }

    const [uTL, uTR, uBR, uBL] = unwrapHues(
      pts[2][hueIndex], pts[3][hueIndex], pts[1][hueIndex], pts[0][hueIndex]
    );
    /* unwrapHues answers in the order of the sides: top left, top right,
       bottom right, bottom left */
    pts[0][hueIndex] = uBL;
    pts[1][hueIndex] = uBR;
    pts[2][hueIndex] = uTL;
    pts[3][hueIndex] = uTR;
    return pts;
  }

  /* Each space: `from` brings a sRGB corner into the space, `mix` blends two
     points of that space, `to` comes back to sRGB while clamping what falls
     outside the screen gamut. `hueIndex` / `chromaIndex` mark a cylindrical
     space (hue + chroma): there the hue is unfolded before interpolation. */
  const SPACES = {
    srgb: {
      label: "sRGB",
      hint: "Blends the display codes themselves: the midpoint of #FF0000 and #00FF00 is exactly #808000. This is the familiar behaviour of a HEX code, and the default.",
      from: (c) => c,
      mix: mixComponents,
      to: clampTriplet,
    },
    linear: {
      label: "Linear light",
      hint: "Blends light energy, like a 3D engine. Mixes stay bright but lose saturation: blue + yellow gives a light gray.",
      from: (c) => c.map(srgbToLinear),
      mix: mixComponents,
      to: (c) => clampTriplet(c.map(linearToSrgb)),
    },
    oklab: {
      label: "OkLab",
      hint: "Perceptual space: lightness looks constant along the gradient and the steps look evenly spaced. The softest option for a gradient of hues.",
      from: (c) => linearToOklab(c.map(srgbToLinear)),
      mix: mixComponents,
      to: (c) => clampTriplet(oklabToLinear(c).map(linearToSrgb)),
    },
    oklch: {
      label: "OkLch (hue)",
      hint: "Travels around the color wheel keeping perceived saturation constant. Vivid gradients, without passing through gray. The 4 corner hues are unfolded into one continuous scale: no rupture line.",
      from: (c) => oklabToOklch(linearToOklab(c.map(srgbToLinear))),
      mix: mixComponents,
      hueIndex: 2,
      chromaIndex: 1,
      to: (c) => clampTriplet(oklabToLinear(oklchToOklab([c[0], c[1], normalizeHue(c[2])])).map(linearToSrgb)),
    },
    hsl: {
      label: "HSL (hue)",
      hint: "Goes through the intermediate hues: red → green gives yellow, not olive. Very saturated rendering; lightness is HSL lightness. The 4 corner hues are unfolded into one continuous scale: no rupture line.",
      from: rgbToHsl,
      mix: mixComponents,
      hueIndex: 0,
      chromaIndex: 1,
      to: (c) => clampTriplet(hslToRgb([normalizeHue(c[0]), c[1], c[2]])),
    },
    hsv: {
      label: "HSV (hue)",
      hint: "Like HSL, but blends the pixel value: full colors stay full of light, dark ones stay dark. The 4 corner hues are unfolded into one continuous scale: no rupture line.",
      from: rgbToHsv,
      mix: mixComponents,
      hueIndex: 0,
      chromaIndex: 1,
      to: (c) => clampTriplet(hsvToRgb([normalizeHue(c[0]), c[1], c[2]])),
    },
  };

  const DEFAULT_SPACE = "srgb";

  const isSpace = (name) => Object.prototype.hasOwnProperty.call(SPACES, name);
  const spaceNames = () => Object.keys(SPACES);
  const spaceLabel = (name) => SPACES[isSpace(name) ? name : DEFAULT_SPACE].label;
  const spaceHint = (name) => SPACES[isSpace(name) ? name : DEFAULT_SPACE].hint;

  /* ---------------------- control points: the lattice ----------------------

     A control point is a color imposed inside the frame, at a position given as
     a fraction of the width and of the height (0..1), whatever the number of
     cells: 0.5 / 0.5 stays the middle of the image at density 5 as well as at
     density 40.

     Each point opens a control column and a control row through the image.
     Sorting the positions of all the points — the 4 corners included — along x
     and along y builds a lattice of nodes: a node set by the user keeps its own
     color, every other node keeps the color the plain corner gradient already
     had at that spot, and each patch of the lattice is then blended bilinearly,
     exactly as the whole frame used to be.

     Which gives: the 4 corners come out intact, every control point is honoured
     exactly where it stands, neighbouring patches share their edge by
     construction so the field stays continuous — and with no control point at
     all the lattice is simply the 4 corners, the very same computation as
     before. */

  /* positions are kept on a 1/1,000,000 grid: two points set at the same spot
     make one single node, and a point sitting on an edge becomes a corner */
  function snapPosition(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    const c = clamp01(n);
    if (c < 1e-6) return 0;
    if (c > 1 - 1e-6) return 1;
    return Math.round(c * 1e6) / 1e6;
  }

  /* one axis: the two edges plus the positions set, sorted, duplicates merged */
  function buildAxis(values) {
    const all = [0, 1].concat(values.filter((v) => v > 0 && v < 1));
    all.sort((a, b) => a - b);
    const out = [];
    for (const v of all) {
      if (!out.length || v - out[out.length - 1] > 1e-9) out.push(v);
    }
    return out;
  }

  function indexOnAxis(axis, v) {
    for (let i = 0; i < axis.length; i++) if (Math.abs(axis[i] - v) <= 1e-9) return i;
    return 0;
  }

  /* which patch, and where inside that patch */
  function segment(axis, v) {
    let i = 0;
    for (let k = 0; k < axis.length; k++) if (axis[k] <= v + 1e-12) i = k;
    i = Math.min(i, Math.max(0, axis.length - 2));
    const span = axis[i + 1] - axis[i];
    return [i, span > 1e-12 ? clamp01((v - axis[i]) / span) : 0];
  }

  function meanHue(hues) {
    let x = 0, y = 0;
    for (const h of hues) {
      x += Math.cos(h * Math.PI / 180);
      y += Math.sin(h * Math.PI / 180);
    }
    return normalizeHue(Math.atan2(y, x) * 180 / Math.PI);
  }

  /* Builds a ramp: (x, y) in [0,1] -> sRGB color, with the row y = 1 on top.
     The 4 corners are converted once per space and per set of colors, the hues
     are unfolded once, then the interpolation stays within continuous numbers.
     `controlPoints` is optional: [{ x, y, color }] with x from the left and y
     from the BOTTOM edge — the lattice described above then takes over. */
  function makeRamp(spaceName, corners, controlPoints) {
    const sp = SPACES[isSpace(spaceName) ? spaceName : DEFAULT_SPACE];
    let points = [
      sp.from(toTriplet(corners.bottomLeft)),
      sp.from(toTriplet(corners.bottomRight)),
      sp.from(toTriplet(corners.topLeft)),
      sp.from(toTriplet(corners.topRight)),
    ];
    if (sp.hueIndex !== undefined) points = unwrapCorners(points, sp.hueIndex, sp.chromaIndex);

    const [bottomLeft, bottomRight, topLeft, topRight] = points;

    /* the plain corner field: every node the user did not set keeps its color */
    const field = (x, y) =>
      sp.mix(sp.mix(bottomLeft, bottomRight, x), sp.mix(topLeft, topRight, x), y);

    /* damaged points (not a number, a color that is not a color) are simply left
       out: the grid is built without them. So are points landing on a corner:
       the 4 corners belong to the 4 corner colors and are never replaced. */
    const wanted = (Array.isArray(controlPoints) ? controlPoints : [])
      .filter((p) => p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y)))
      .map((p) => ({ x: snapPosition(p.x), y: snapPosition(p.y), color: sp.from(toTriplet(p.color)) }))
      .filter((p) => !((p.x === 0 || p.x === 1) && (p.y === 0 || p.y === 1)));

    const xs = buildAxis(wanted.map((p) => p.x));
    const ys = buildAxis(wanted.map((p) => p.y));

    /* nodes[j][i]: j along y (0 = bottom edge, last row = top edge), i along x */
    const nodes = ys.map((y) => xs.map((x) => field(x, y)));

    const hueIndex = sp.hueIndex;
    const chromaIndex = sp.chromaIndex;
    const hasHue = hueIndex !== undefined;
    const colored = (t) => !hasHue || Math.abs(t[chromaIndex]) > 1e-4;
    const cornerHues = hasHue ? points.filter(colored).map((p) => p[hueIndex]) : [];

    for (const p of wanted) {
      const i = indexOnAxis(xs, p.x);
      const j = indexOnAxis(ys, p.y);
      const here = nodes[j][i];        // the color the plain gradient had there
      const trip = p.color.slice();

      if (hasHue) {
        /* a gray, black or white point has no hue of its own: it takes the hue of
           the field it lands in, instead of forcing red into the gradient */
        if (!colored(trip)) {
          trip[hueIndex] = colored(here) ? here[hueIndex]
            : (cornerHues.length ? meanHue(cornerHues) : 0);
        }
        /* the point hue is brought back into the branch of the circle the field
           around it belongs to: the transition stays the shortest one, and no
           rupture line appears around the point */
        if (colored(here)) {
          trip[hueIndex] += 360 * Math.round((here[hueIndex] - trip[hueIndex]) / 360);
        }
      }
      nodes[j][i] = trip;
    }

    const ramp = function ramp(x, y) {
      const [ix, u] = segment(xs, x);
      const [jy, v] = segment(ys, y);
      const lower = sp.mix(nodes[jy][ix], nodes[jy][ix + 1], u);
      const upper = sp.mix(nodes[jy + 1][ix], nodes[jy + 1][ix + 1], u);
      return sp.to(sp.mix(lower, upper, v));
    };

    /* the points in the chosen space, hues unfolded: used by the tests */
    ramp.points = points;
    ramp.corners = points;
    /* the lattice actually built: axes, node colors, control points kept */
    ramp.lattice = { xs, ys, nodes, controlPoints: wanted };
    return ramp;
  }

  return { DEFAULT_SPACE, SPACES, isSpace, spaceNames, spaceLabel, spaceHint, makeRamp };
})();
