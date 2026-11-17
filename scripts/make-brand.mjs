// Draws the Opening Night logo and writes every asset made from it:
//
//   node scripts/make-brand.mjs
//
// The logo is a chess knight cut out of a closed theater curtain, with the
// stage light coming through it. The knight is drawn by hand (`KNIGHT` below);
// the curtain is computed from it, so its folds bunch up wherever the knight
// pushes them aside. Change the knight and the curtain follows.
//
// The SVGs in assets/brand need nothing but Node. The PNGs in assets/images
// are rendered with Playwright's Chromium, which this app doesn't depend on:
// run the script somewhere `playwright` resolves, or it stops after the SVGs.
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const SIZE = 1024;
const root = fileURLToPath(new URL('..', import.meta.url));

const color = {
  curtain: '#84152f',
  foldLight: '#c9304d',
  foldDark: '#2c0714',
  eye: '#7a1530',
  shade: '#12081c',
  stage: '#1b1430',
  glow: '#ffb85c',
  lightCore: '#fff6dc',
  lightMid: '#f7cf74',
  light: '#d9a441',
};

// The knight, facing left on a 1024 grid. Each point is [x, y]; a third
// element marks a corner, and the rest are joined by a smooth curve.
const KNIGHT = {
  body: [
    [372, 772, 1], [356, 726], [366, 668], [404, 606], [446, 548],
    [470, 490, 1], // throat
    [424, 520], [370, 540], [322, 548], [284, 538], [259, 510], [255, 474], // jaw, muzzle
    [272, 444], [304, 412], [350, 368], [400, 306], [436, 262],
    [446, 252, 1], [482, 150, 1], [530, 226, 1], // ear
    [612, 268], [688, 352], [734, 470], [744, 600], [730, 700], [708, 772, 1],
  ],
  // A lens between two corners, bulging toward `over` and `under`.
  eye: { from: [386, 370], to: [446, 334], over: [402, 328], under: [426, 368] },
  collar: { x: 338, y: 784, w: 404, h: 26, r: 13 },
  foot: { x: 296, y: 822, w: 488, h: 46, r: 12 },
  // The line above the ear where the two curtains meet.
  seam: 482,
};

const round = (n) => +n.toFixed(1);

/** Cubic Bezier segments through `points`: Catmull-Rom, broken at corners. */
function segments(points, closed) {
  const n = points.length;
  const out = [];
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p0 = p1[2] ? p1 : points[(i - 1 + n) % n];
    const p3 = p2[2] ? p2 : points[(i + 2) % n];
    out.push([
      p1,
      [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6],
      [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6],
      p2,
    ]);
  }
  return out;
}

function pathData(points, closed = true) {
  const segs = segments(points, closed);
  const start = segs[0][0];
  const curves = segs.map(
    ([, c1, c2, p]) =>
      `C${round(c1[0])} ${round(c1[1])} ${round(c2[0])} ${round(c2[1])} ${round(p[0])} ${round(p[1])}`,
  );
  return `M${round(start[0])} ${round(start[1])}${curves.join('')}${closed ? 'Z' : ''}`;
}

/** The knight scaled about the center of the canvas. */
function placeKnight(scale) {
  const at = (v) => SIZE / 2 + (v - SIZE / 2) * scale;
  const box = ({ x, y, w, h, r }) => ({
    x: at(x),
    y: at(y),
    w: w * scale,
    h: h * scale,
    r: r * scale,
  });
  const point = ([x, y]) => `${round(at(x))} ${round(at(y))}`;
  const { from, to, over, under } = KNIGHT.eye;
  return {
    body: KNIGHT.body.map(([x, y, corner]) => [at(x), at(y), corner]),
    eye: `M${point(from)}Q${point(over)} ${point(to)}Q${point(under)} ${point(from)}Z`,
    collar: box(KNIGHT.collar),
    foot: box(KNIGHT.foot),
    seam: at(KNIGHT.seam),
  };
}

/** The knight's outline; `eyeHole` cuts the eye out of it. */
function knightShapes(knight, eyeHole = false) {
  const rect = ({ x, y, w, h, r }) =>
    `<rect x="${round(x)}" y="${round(y)}" width="${round(w)}" height="${round(h)}" rx="${round(r)}"/>`;
  const body = eyeHole
    ? `<path fill-rule="evenodd" d="${pathData(knight.body)}${knight.eye}"/>`
    : `<path d="${pathData(knight.body)}"/>`;
  return `${body}${rect(knight.collar)}${rect(knight.foot)}`;
}

/** How far left and right the knight reaches on each row of the canvas. */
function knightEdges(knight) {
  const left = new Array(SIZE).fill(null);
  const right = new Array(SIZE).fill(null);
  const mark = (x, y) => {
    if (y < 0 || y >= SIZE) return;
    if (left[y] === null || x < left[y]) left[y] = x;
    if (right[y] === null || x > right[y]) right[y] = x;
  };
  const outline = [];
  for (const [p0, c1, c2, p3] of segments(knight.body, true)) {
    for (let step = 0; step < 24; step++) {
      const t = step / 24;
      const m = 1 - t;
      outline.push([0, 1].map((k) =>
        m * m * m * p0[k] + 3 * m * m * t * c1[k] + 3 * m * t * t * c2[k] + t * t * t * p3[k],
      ));
    }
  }
  outline.forEach(([x0, y0], i) => {
    const [x1, y1] = outline[(i + 1) % outline.length];
    for (let y = Math.ceil(Math.min(y0, y1)); y <= Math.max(y0, y1); y++) {
      mark(y1 === y0 ? x0 : x0 + ((x1 - x0) * (y - y0)) / (y1 - y0), y);
    }
  });
  for (const { x, y, w, h } of [knight.collar, knight.foot]) {
    for (let row = Math.ceil(y); row <= y + h; row++) {
      mark(x, row);
      mark(x + w, row);
    }
  }
  // Above the ear the curtains meet at the seam; below the foot and in the
  // gaps of the base they hang where the nearest row above left them.
  for (const edge of [left, right]) {
    let last = knight.seam;
    for (let y = 0; y < SIZE; y++) {
      if (edge[y] === null) edge[y] = last;
      else last = edge[y];
    }
  }
  return { left, right };
}

/** Widen `edge` by `reach` rows (so cloth clears every bump), then smooth it. */
function drapeEdge(edge, pick, reach, sigma) {
  const widened = edge.map((_, y) => {
    let v = edge[y];
    for (let k = Math.max(0, y - reach); k <= Math.min(SIZE - 1, y + reach); k++) v = pick(v, edge[k]);
    return v;
  });
  const radius = Math.ceil(sigma * 3);
  return widened.map((_, y) => {
    let sum = 0;
    let weight = 0;
    for (let k = -radius; k <= radius; k++) {
      const w = Math.exp((-k * k) / (2 * sigma * sigma));
      sum += widened[Math.min(SIZE - 1, Math.max(0, y + k))] * w;
      weight += w;
    }
    return sum / weight;
  });
}

/**
 * The curtain's fold lines. Each curtain hangs in even folds from the top and
 * is pushed aside by the knight on each row. The folds nearest the knight take
 * most of the push and follow its outline closely; the ones farther out move
 * less and only follow its general shape, the way gathered cloth does.
 */
function curtainFolds(knight, scale) {
  const { left, right } = knightEdges(knight);
  const reach = Math.round(50 * scale);
  const edges = {
    left: [drapeEdge(left, Math.min, reach, 36 * scale), drapeEdge(left, Math.min, reach, 120 * scale)],
    right: [drapeEdge(right, Math.max, reach, 36 * scale), drapeEdge(right, Math.max, reach, 120 * scale)],
  };
  const rows = [];
  for (let y = 0; y < SIZE; y += 24) rows.push(y);
  rows.push(SIZE - 1);

  let valleys = '';
  let ridges = '';
  for (const side of ['left', 'right']) {
    const [close, loose] = edges[side];
    const width = side === 'left' ? knight.seam : SIZE - knight.seam;
    const count = Math.round(width / (80 * scale));
    // `u` runs from 0 at the edge of the canvas to 1 at the knight.
    const line = (u) =>
      pathData(
        rows.map((y, i) => {
          const edge = loose[y] + (close[y] - loose[y]) * u * u;
          const pushed = Math.abs(edge - knight.seam) * u ** 1.5;
          const fromSide = u * width - pushed;
          return [side === 'left' ? fromSide : SIZE - fromSide, y, i === 0 || i === rows.length - 1];
        }),
        false,
      );
    for (let k = 0; k <= count; k++) {
      valleys += `<path d="${line(k / count)}"/>`;
      if (k < count) ridges += `<path d="${line((k + 0.45) / count)}"/>`;
    }
  }
  return { valleys, ridges };
}

/**
 * One picture of the logo as an SVG string.
 *
 * - `scale` sizes the knight about the center (the curtain always fills the canvas).
 * - `curtain` draws the curtain and stage; `knight` draws the knight and its glow.
 * - `corner` rounds the canvas into a tile.
 * - `flat` draws the knight alone in one color, for single-color uses.
 */
function logo({ scale = 1, curtain = true, knight: showKnight = true, corner = 0, flat } = {}) {
  const knight = placeKnight(scale);
  const shapes = knightShapes(knight);
  const open = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}"`;
  if (flat) return `${open} fill="${flat}">\n${knightShapes(knight, true)}\n</svg>\n`;

  const px = (n) => round(n * scale);
  const at = (v) => round(SIZE / 2 + (v - SIZE / 2) * scale);
  const stageY = round(knight.foot.y + knight.foot.h);
  const { x: footX, w: footW } = knight.foot;
  const blur = (id, amount, pad = 40) =>
    `<filter id="${id}" x="-${pad}%" y="-${pad}%" width="${100 + 2 * pad}%" height="${100 + 2 * pad}%"><feGaussianBlur stdDeviation="${px(amount)}"/></filter>`;

  const defs = [];
  let art = '';
  if (corner) {
    defs.push(`<clipPath id="tile"><rect width="${SIZE}" height="${SIZE}" rx="${corner}"/></clipPath>`);
  }
  if (curtain) {
    const { valleys, ridges } = curtainFolds(knight, scale);
    defs.push(
      blur('soft', 8, 10),
      blur('spill', 8, 20),
      `<linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color.shade}" stop-opacity="0.6"/><stop offset="0.28" stop-color="${color.shade}" stop-opacity="0"/><stop offset="0.7" stop-color="${color.shade}" stop-opacity="0"/><stop offset="1" stop-color="${color.shade}" stop-opacity="0.45"/></linearGradient>`,
      `<linearGradient id="floorLight" x1="0" y1="${stageY}" x2="0" y2="${SIZE}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${color.lightMid}" stop-opacity="0.8"/><stop offset="1" stop-color="${color.light}" stop-opacity="0"/></linearGradient>`,
      `<radialGradient id="footlight" cx="${at(540)}" cy="${stageY}" r="${px(520)}" gradientUnits="userSpaceOnUse" gradientTransform="translate(0 ${stageY}) scale(1 0.12) translate(0 ${-stageY})"><stop offset="0" stop-color="${color.lightMid}" stop-opacity="0.9"/><stop offset="1" stop-color="${color.light}" stop-opacity="0"/></radialGradient>`,
      `<clipPath id="drape"><rect width="${SIZE}" height="${stageY}"/></clipPath>`,
    );
    art += `
<rect width="${SIZE}" height="${SIZE}" fill="${color.stage}"/>
<path filter="url(#spill)" fill="url(#floorLight)" d="M${round(footX - px(6))} ${stageY}H${round(footX + footW + px(6))}L${round(footX + footW + (SIZE - stageY))} ${SIZE + 20}H${round(footX - (SIZE - stageY))}Z"/>
<rect y="${stageY}" width="${SIZE}" height="${round(SIZE - stageY)}" fill="url(#footlight)"/>
<g clip-path="url(#drape)">
<rect width="${SIZE}" height="${stageY}" fill="${color.curtain}"/>
<g filter="url(#soft)" fill="none">
<g stroke="${color.foldDark}" stroke-width="${px(18)}" opacity="0.85">${valleys}</g>
<g stroke="${color.foldLight}" stroke-width="${px(26)}" opacity="0.75">${ridges}</g>
</g>
<rect width="${SIZE}" height="${stageY}" fill="url(#shade)"/>
</g>`;
  }
  if (showKnight) {
    defs.push(
      blur('glow', 46),
      blur('rim', 12),
      `<radialGradient id="light" cx="${at(490)}" cy="${at(430)}" r="${px(470)}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${color.lightCore}"/><stop offset="0.4" stop-color="${color.lightMid}"/><stop offset="1" stop-color="${color.light}"/></radialGradient>`,
    );
    // The glow is the light catching the cloth, so it stops at the stage.
    art += `
<g${curtain ? ' clip-path="url(#drape)"' : ''}>
<g filter="url(#glow)" fill="${color.glow}" opacity="0.4">${shapes}</g>
<g filter="url(#rim)" fill="${color.glow}" stroke="${color.glow}" stroke-width="${px(10)}" opacity="0.55">${shapes}</g>
</g>
<g fill="url(#light)">${shapes}</g>
<path fill="${color.eye}" d="${knight.eye}"/>`;
  }
  const body = corner ? `<g clip-path="url(#tile)">${art}\n</g>` : art.trimStart();
  return `${open}>\n<defs>\n${defs.join('\n')}\n</defs>\n${body}\n</svg>\n`;
}

// Android crops its icons to the middle two thirds, so the knight is smaller there.
const ANDROID = 0.66;

const svgs = {
  'assets/brand/logo.svg': logo({ corner: 230 }).replace(
    '<svg ',
    '<svg role="img" aria-label="Opening Night" ',
  ),
  'assets/brand/knight.svg': logo({ flat: color.light }),
};

const pngs = [
  { file: 'icon.png', size: 1024, svg: logo(), opaque: true },
  { file: 'android-icon-background.png', size: 1024, svg: logo({ scale: ANDROID, knight: false }), opaque: true },
  { file: 'android-icon-foreground.png', size: 1024, svg: logo({ scale: ANDROID, curtain: false }) },
  { file: 'android-icon-monochrome.png', size: 1024, svg: logo({ scale: ANDROID, flat: '#fff' }) },
  // Android 12 and later crop the splash image to a circle two thirds as wide.
  { file: 'splash-icon.png', size: 512, svg: logo({ scale: 0.76, curtain: false }) },
  { file: 'logo-mark.png', size: 160, svg: logo() },
  { file: 'favicon.png', size: 48, svg: logo({ scale: 1.12, corner: 230 }) },
];

for (const [file, svg] of Object.entries(svgs)) writeFileSync(root + file, svg);
console.log(`Wrote ${Object.keys(svgs).join(', ')}`);

let chromium;
try {
  ({ chromium } = createRequire(import.meta.url)('playwright'));
} catch {
  console.error('Playwright not found, so the PNGs in assets/images were left as they were.');
  process.exit(1);
}
const browser = await chromium.launch();
for (const { file, size, svg, opaque } of pngs) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(
    `<body style="margin:0">${svg.replace('<svg ', `<svg width="${size}" height="${size}" style="display:block" `)}`,
  );
  await page.screenshot({ path: `${root}assets/images/${file}`, omitBackground: !opaque });
  await page.close();
}
await browser.close();
console.log(`Wrote ${pngs.map((p) => p.file).join(', ')} to assets/images`);
