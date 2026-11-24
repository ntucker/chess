#!/usr/bin/env node
/**
 * Checks the exported web app's phone layout in a real browser, which the
 * jsdom tests can't: they have no layout engine. It serves the export, opens
 * each board page at three phone sizes, and checks that the page fits the
 * screen without scrolling, the board is whole and in view with its name
 * bars, the panel under it keeps its floor, and the board is the same size on
 * every page at one screen size, whatever sits under it. Screenshots of each
 * state land in the output folder.
 *
 *   yarn expo export --platform web
 *   yarn check:layout [export folder, default dist] [screenshot folder, default layout-check]
 *
 * PAGES_BASE_PATH, as the export was built with, is the path the site is served under.
 */
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright';

const site = resolve(process.argv[2] ?? 'dist');
const shots = resolve(process.argv[3] ?? 'layout-check');
const base = process.env.PAGES_BASE_PATH ?? '';

/** The phone sizes the redesign must fit: a tall phone, the same phone with the browser's bars, and a small one. */
const SCREENS = [
  { width: 390, height: 844 },
  { width: 390, height: 664 },
  { width: 360, height: 640 },
];
/** Rounding a browser's layout leaves between boxes that should match. */
const SLACK = 1;

/**
 * The states to check, each a page and what to do on it. A lesson's `moves`
 * replay a game, so one address shows a line under way or past the guide.
 */
const STATES = [
  { name: 'start', path: '/' },
  { name: 'lesson', path: '/lesson/caro-kann' },
  {
    name: 'lesson-scoresheet',
    path: '/lesson/caro-kann',
    act: (page) => page.getByRole('button', { name: /^Scoresheet/ }).click(),
  },
  { name: 'lesson-line', path: '/lesson/caro-kann?moves=e2e4 c7c6 d2d4 d7d5 b1c3 d5e4 c3e4' },
  { name: 'lesson-past-guide', path: '/lesson/caro-kann?moves=e2e4 c7c6 d2d4 h7h5' },
  { name: 'play', path: '/play' },
];

const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ttf': 'font/ttf',
};

/** Serves the export as GitHub Pages does: `/a` is `a.html` or `a/index.html`. */
function serve() {
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url, 'http://x').pathname);
    const inSite = path.startsWith(base) ? path.slice(base.length) : null;
    const file =
      inSite === null
        ? undefined
        : [inSite, `${inSite}.html`, join(inSite, 'index.html')]
            .map((candidate) => join(site, candidate))
            .find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
    if (!file) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(response);
  });
  return new Promise((done) => server.listen(0, '127.0.0.1', () => done(server)));
}

/**
 * The boxes the checks read, in CSS pixels, and the floors narrow.css sets,
 * read from the page so they can't drift from it.
 */
function measure() {
  const box = (selector) => document.querySelector(selector)?.getBoundingClientRect().toJSON();
  const part = (name) => `[data-narrow='${name}']`;
  const program = document.querySelector(part('program'));
  return {
    screen: { width: innerWidth, height: innerHeight },
    // React Native Web scrolls a view inside the document, so the page's own box shows whether it fits.
    page: box(part('page')),
    pageWidth: document.documentElement.scrollWidth,
    board: box('cg-board'),
    column: box(part('board-column')),
    program: program?.getBoundingClientRect().toJSON(),
    boardMin: parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--board-min'),
    ),
    programFloor: program && parseFloat(getComputedStyle(program).minHeight),
  };
}

/** What's wrong with one state's layout, in words. */
function problems({ screen, page, pageWidth, board, column, program, boardMin, programFloor }) {
  // A missing part would skip its checks and pass: renaming one must fail here.
  const missing = Object.entries({ page, board, column, program })
    .filter(([, found]) => !found)
    .map(([name]) => `no ${name}`);
  if (missing.length) return missing;
  const found = [];
  if (pageWidth > screen.width) found.push(`the page scrolls sideways (${pageWidth}px wide)`);
  if (page.bottom > screen.height + SLACK) found.push(`the page scrolls (${page.bottom}px tall)`);
  if (Math.abs(board.width - board.height) > SLACK) {
    found.push(`the board isn't square (${board.width}×${board.height})`);
  }
  if (board.width < boardMin - SLACK)
    found.push(`the board is ${board.width}px, under ${boardMin}`);
  if (board.left < -SLACK || board.right > screen.width + SLACK) {
    found.push('the board runs off the side');
  }
  if (column.bottom > screen.height + SLACK) {
    found.push(`the player's bar ends at ${column.bottom}px, below the screen`);
  }
  if (program.height < programFloor - SLACK) {
    found.push(`the panel is ${program.height}px, under its ${programFloor}px floor`);
  }
  if (program.bottom > screen.height + SLACK) {
    found.push(`the panel ends at ${program.bottom}px, below the screen`);
  }
  return found;
}

/** Waits for the page to load what it fetches and its fonts, and for its layout to hold still for a frame. */
async function settle(page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(async () => {
    await document.fonts.ready;
    const frame = () => new Promise(requestAnimationFrame);
    const layout = () =>
      JSON.stringify(document.querySelector('cg-board')?.getBoundingClientRect());
    for (let last = layout(); ;) {
      await frame();
      await frame();
      const now = layout();
      if (now === last) return;
      last = now;
    }
  });
}

/** Checks every state at one screen size, and returns what's wrong. */
async function checkScreen(browser, origin, screen) {
  const size = `${screen.width}x${screen.height}`;
  const context = await browser.newContext({
    viewport: screen,
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
  });
  const failures = [];
  let first;
  for (const state of STATES) {
    const where = `${size} ${state.name}`;
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(origin + state.path);
    await page.locator('cg-board').waitFor();
    await state.act?.(page);
    await settle(page);
    await page.screenshot({ path: join(shots, `${size}-${state.name}.png`) });
    const layout = await page.evaluate(measure);
    for (const problem of [...problems(layout), ...errors]) failures.push(`${where}: ${problem}`);
    if (layout.board) {
      const { width } = layout.board;
      first ??= { where, width };
      if (Math.abs(width - first.width) > SLACK) {
        failures.push(`${where}: the board is ${width}px, ${first.width}px in ${first.where}`);
      }
    }
    await page.close();
  }
  await context.close();
  return failures;
}

const server = await serve();
const origin = `http://127.0.0.1:${server.address().port}${base}`;
mkdirSync(shots, { recursive: true });
const browser = await chromium.launch();
let failures;
try {
  // Each size has its own browser context, so they run side by side.
  failures = (
    await Promise.all(SCREENS.map((screen) => checkScreen(browser, origin, screen)))
  ).flat();
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error(`Layout check failed:\n${failures.map((failure) => `- ${failure}`).join('\n')}`);
  process.exit(1);
}
console.log(
  `Layout check passed: ${STATES.length} states at ${SCREENS.length} sizes. Screenshots in ${shots}.`,
);
