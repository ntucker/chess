// Draws the Opening Night logo and writes every asset made from it:
//
//   node scripts/make-brand.mjs
//
// The logo is a gold chess knight standing in a spotlight on a dark stage,
// framed by two red curtains tied back at the sides. Everything is drawn on a
// 1024 grid: the knight from the points in `KNIGHT`, the stage and curtains
// from the shapes in `stage()` and `curtain()`.
//
// The SVGs in assets/brand need nothing but Node. The PNGs in assets/images
// are rendered with Playwright's Chromium, which this app doesn't depend on:
// run the script somewhere `playwright` resolves, or it stops after the SVGs.
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const SIZE = 1024;
const root = fileURLToPath(new URL('..', import.meta.url));

// The three brand colors, as in src/theme/theme.ts.
const brand = {
  velvet: '#3b2d55',
  spotlight: '#d9a441',
  curtain: '#8f1b35',
};

const color = {
  // The stage: the back wall, the dark it fades to, the beam and the floor.
  night: '#231a3a',
  dark: '#0e0a18',
  beam: '#9a86c8',
  floorFar: '#1a1229',
  floorNear: '#0c0814',
  // The curtains' folds, from the lit side to the deepest shadow.
  sheen: '#a8223f',
  fold: '#6c1329',
  shadow: '#4c0c1c',
  // The knight, from where the light hits it outward, and its eye.
  lightCore: '#fff6dc',
  lightMid: '#f7cf74',
  eye: '#2a1838',
};

// The knight, facing left. Each point is [x, y]; a third element marks a
// corner, and the rest are joined by a smooth curve.
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
  collar: { x: 338, y: 784, width: 404, height: 26, rx: 13 },
  foot: { x: 296, y: 822, width: 488, height: 46, rx: 12 },
};

// The stage floor starts behind the knight's foot and the knight stands on it.
const HORIZON = KNIGHT.foot.y;
const STAND = KNIGHT.foot.y + KNIGHT.foot.height;
// The canvas can be drawn smaller than the picture (see `logo`), so every
// backdrop shape runs this far past its edges.
const BLEED = 300;

const round = (n) => +n.toFixed(1);

/** A closed path through `points`: Catmull-Rom curves, broken at corners. */
function smoothPath(points) {
  const n = points.length;
  let d = `M${points[0][0]} ${points[0][1]}`;
  for (let i = 0; i < n; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p0 = p1[2] ? p1 : points[(i - 1 + n) % n];
    const p3 = p2[2] ? p2 : points[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${round(c1[0])} ${round(c1[1])} ${round(c2[0])} ${round(c2[1])} ${p2[0]} ${p2[1]}`;
  }
  return `${d}Z`;
}

const rect = (attrs) =>
  `<rect ${Object.entries(attrs).map(([key, value]) => `${key}="${value}"`).join(' ')}/>`;

const knightBody = smoothPath(KNIGHT.body);
const knightEye = (({ from, to, over, under }) =>
  `M${from.join(' ')}Q${over.join(' ')} ${to.join(' ')}Q${under.join(' ')} ${from.join(' ')}Z`)(KNIGHT.eye);
const knightBase = rect(KNIGHT.collar) + rect(KNIGHT.foot);
const knightOutline = `<path d="${knightBody}"/>${knightBase}`;

/** The knight in one color, with the eye cut out of it. */
const flatKnight = `<path fill-rule="evenodd" d="${knightBody}${knightEye}"/>${knightBase}`;

/** The knight in gold, lit from the front, with a haze of light around it. */
function knight() {
  return {
    defs: `
<filter id="haze" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="56"/></filter>
<radialGradient id="light" cx="490" cy="430" r="470" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${color.lightCore}"/><stop offset="0.4" stop-color="${color.lightMid}"/><stop offset="1" stop-color="${brand.spotlight}"/></radialGradient>`,
    art: `
<g filter="url(#haze)" fill="${color.lightMid}" opacity="0.22">${knightOutline}</g>
<g fill="url(#light)">${knightOutline}</g>
<path fill="${color.eye}" d="${knightEye}"/>`,
  };
}

/**
 * The left curtain: it hangs from the top, is gathered by a gold tieback at
 * the side and falls straight from there. Its folds fan out from the tieback.
 */
function curtain() {
  const x = 74; // where the tieback gathers the cloth
  const top = 456;
  const bottom = 484;
  const end = SIZE + BLEED;
  // A fold of the upper cloth, from a span of the top edge down to a span of the tieback.
  const fold = ([a, b], [c, d], [bend1, bend2]) =>
    `<path d="M${a} ${-BLEED}H${b}V0C${bend1.join(' ')} ${x + d} ${top}H${x + c}C${bend2.join(' ')} ${a} 0Z"/>`;
  // A fold of the cloth below the tieback, from a span of the tieback to a span of the hem.
  const fall = ([a, b], [c, d]) =>
    `<path d="M${a} ${bottom}H${b}C${b + 8} 640 ${d} 800 ${d} ${SIZE}V${end}H${c}V${SIZE}C${c} 800 ${a + 8} 640 ${a} ${bottom}Z"/>`;
  // A straight fold of the cloth that hangs outside the canvas.
  const outer = (a, b) => rect({ x: a, y: -BLEED, width: b - a, height: end + BLEED });
  return `
<path fill="${brand.curtain}" d="M${-BLEED} ${-BLEED}H512V0C404 64 236 240 ${x + 40} ${top}V${bottom}C168 600 136 780 136 ${SIZE}V${end}H${-BLEED}Z"/>
<g fill="${color.sheen}">
${outer(-246, -206)}${outer(-104, -62)}
${fold([70, 120], [-44, -30], [[112, 170, 96, 330], [56, 320, 66, 160]])}
${fold([236, 276], [2, 8], [[246, 160, 180, 320], [150, 320, 214, 160]])}
${fold([372, 404], [25, 28], [[344, 130, 244, 290], [226, 290, 322, 130]])}
${fall([74, 92], [62, 80])}
</g>
<g fill="${color.fold}">
${outer(-176, -128)}${outer(-36, 0)}
${fold([0, 44], [-74, -52], [[40, 180, 40, 330], [0, 330, 0, 180]])}
${fold([150, 212], [-24, 0], [[190, 170, 146, 330], [112, 320, 140, 160]])}
${fold([300, 352], [10, 24], [[310, 150, 226, 316], [200, 320, 270, 150]])}
${fold([430, 470], [30, 38], [[400, 90, 268, 256], [250, 270, 370, 100]])}
${fall([36, 70], [26, 58])}
${fall([100, 126], [86, 110])}
</g>
<path fill="${color.shadow}" opacity="0.5" d="M${-BLEED} ${bottom}H${x + 44}L${x + 46} ${bottom + 36}H${-BLEED}Z"/>
<path fill="none" stroke="url(#edgeLight)" stroke-width="6" stroke-linecap="round" d="M498 12C394 74 232 244 ${x + 40} ${top - 2}"/>
${rect({ x: -BLEED, y: top, width: BLEED + x + 48, height: bottom - top, rx: 14, fill: brand.spotlight })}
${rect({ x: -BLEED, y: top, width: BLEED + x + 48, height: 10, rx: 5, fill: color.lightMid, opacity: 0.8 })}`;
}

/** The stage behind the knight: back wall, beam, floor, pool of light, curtains. */
function stage() {
  const all = { x: -BLEED, y: -BLEED, width: SIZE + 2 * BLEED, height: SIZE + 2 * BLEED };
  return {
    defs: `
<filter id="beamEdge" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2"/></filter>
<filter id="poolEdge" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="5"/></filter>
<radialGradient id="wall" cx="512" cy="400" r="700" gradientUnits="userSpaceOnUse"><stop offset="0.25" stop-color="${color.night}"/><stop offset="1" stop-color="${color.dark}"/></radialGradient>
<linearGradient id="beam" x1="0" y1="0" x2="0" y2="${STAND}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${color.beam}" stop-opacity="0.5"/><stop offset="1" stop-color="${color.beam}" stop-opacity="0.1"/></linearGradient>
<linearGradient id="floor" x1="0" y1="${HORIZON}" x2="0" y2="${SIZE}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${color.floorFar}"/><stop offset="1" stop-color="${color.floorNear}"/></linearGradient>
<radialGradient id="pool"><stop offset="0" stop-color="${color.lightCore}" stop-opacity="0.95"/><stop offset="0.7" stop-color="${color.lightMid}" stop-opacity="0.55"/><stop offset="1" stop-color="${brand.spotlight}" stop-opacity="0.3"/></radialGradient>
<linearGradient id="edgeLight" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color.lightMid}" stop-opacity="0"/><stop offset="0.55" stop-color="${color.lightMid}" stop-opacity="0.85"/><stop offset="1" stop-color="${color.lightMid}" stop-opacity="0.2"/></linearGradient>
<linearGradient id="topShade" x1="0" y1="0" x2="0" y2="320" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${color.dark}" stop-opacity="0.4"/><stop offset="1" stop-color="${color.dark}" stop-opacity="0"/></linearGradient>`,
    art: `
${rect({ ...all, fill: 'url(#wall)' })}
${rect({ ...all, y: HORIZON, fill: 'url(#floor)' })}
<path filter="url(#beamEdge)" fill="url(#beam)" d="M462 ${-BLEED}H562L912 ${STAND}H168Z"/>
<ellipse filter="url(#poolEdge)" cx="540" cy="${STAND - 2}" rx="390" ry="50" fill="url(#pool)"/>
${curtain()}
<g transform="translate(${SIZE} 0) scale(-1 1)">${curtain()}</g>
${rect({ ...all, height: BLEED + 320, fill: 'url(#topShade)' })}`,
  };
}

/**
 * One picture of the logo as an SVG string.
 *
 * - `scale` shrinks or grows the whole picture about the center of the canvas.
 * - `layers` picks what to draw: the `stage`, the `knight`, or both.
 * - `corner` rounds the canvas into a tile.
 * - `flat` draws the knight alone in that color, for single-color uses.
 */
function logo({ scale = 1, layers = ['stage', 'knight'], corner = 0, flat } = {}) {
  const parts = flat ? [] : layers.map((layer) => ({ stage, knight })[layer]());
  let defs = parts.map((part) => part.defs).join('');
  let art = flat ? `\n${flatKnight}` : parts.map((part) => part.art).join('');
  if (scale !== 1) {
    const shift = round((SIZE / 2) * (1 - scale));
    art = `\n<g transform="translate(${shift} ${shift}) scale(${scale})">${art}\n</g>`;
  }
  if (corner) {
    defs += `\n<clipPath id="tile">${rect({ width: SIZE, height: SIZE, rx: corner })}</clipPath>`;
    art = `\n<g clip-path="url(#tile)">${art}\n</g>`;
  }
  const fill = flat ? ` fill="${flat}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}"${fill}>${defs ? `\n<defs>${defs}\n</defs>` : ''}${art}\n</svg>\n`;
}

// Android crops its icons to the middle two thirds, so the picture is smaller there.
const ANDROID = 0.66;

const svgs = {
  'assets/brand/logo.svg': logo({ corner: 230 }).replace(
    '<svg ',
    '<svg role="img" aria-label="Opening Night" ',
  ),
  'assets/brand/knight.svg': logo({ flat: brand.spotlight }),
};

const pngs = [
  { file: 'icon.png', size: 1024, svg: logo(), opaque: true },
  { file: 'android-icon-background.png', size: 1024, svg: logo({ scale: ANDROID, layers: ['stage'] }), opaque: true },
  { file: 'android-icon-foreground.png', size: 1024, svg: logo({ scale: ANDROID, layers: ['knight'] }) },
  { file: 'android-icon-monochrome.png', size: 1024, svg: logo({ scale: ANDROID, flat: '#fff' }) },
  // Android 12 and later crop the splash image to a circle two thirds as wide.
  { file: 'splash-icon.png', size: 512, svg: logo({ scale: 0.76, layers: ['knight'] }) },
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
