// Replaces the site at the root of a gh-pages checkout (the working directory)
// with a new build, for .github/workflows/web.yml:
//
//   node scripts/replace-site.mjs <site>
//
// A page loads some files only when it first needs them: Maia's Web Worker on
// Maia's first move, a lesson when it's picked, another screen's code. Their
// names carry a hash of their content, and most change with every build. A
// page opened before a deploy would ask for files the new build deleted, and
// fail ("Maia didn't answer") until reloaded. So the site keeps the hashed
// files of its last KEEP_BUILDS builds, listed in BUILDS_FILE. A hashed name never
// clashes with another build's file, and the HTML always comes from the new
// build. Pull request previews in pr-preview/ stay as they are.
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** How many builds' hashed files the site keeps, the new one included. About 6 MB each. */
const KEEP_BUILDS = 10;
/** The hashed files of each build the site keeps, oldest first. */
const BUILDS_FILE = '.builds.json';
/** The folders whose files Expo names by their content's hash. */
const HASHED = ['_expo/static', 'assets'];

const [site] = process.argv.slice(2);
if (!site) throw new Error('Usage: node scripts/replace-site.mjs <site>');

/** The hashed files of the site in `dir`, as paths relative to it. */
function hashedFiles(dir) {
  return HASHED.flatMap((folder) =>
    existsSync(join(dir, folder))
      ? readdirSync(join(dir, folder), { recursive: true })
          .map((path) => `${folder}/${path.replaceAll('\\', '/')}`)
          .filter((file) => statSync(join(dir, file)).isFile())
      : [],
  ).sort();
}

// A site published before BUILDS_FILE existed counts as one build.
const builds = existsSync(BUILDS_FILE)
  ? JSON.parse(readFileSync(BUILDS_FILE, 'utf8'))
  : [hashedFiles('.')].filter((files) => files.length);
const files = hashedFiles(site);
// Publishing a build again (a re-run) moves it to the newest place rather
// than taking a second one.
const key = JSON.stringify(files);
const kept = [...builds.filter((build) => JSON.stringify(build) !== key), files].slice(
  -KEEP_BUILDS,
);

// Set aside the kept files of earlier builds, clear the site, and put them
// back under the new build.
const carried = mkdtempSync(join(tmpdir(), 'site-'));
for (const file of new Set(kept.slice(0, -1).flat())) {
  if (existsSync(file)) cpSync(file, join(carried, file));
}
for (const entry of readdirSync('.')) {
  if (entry !== '.git' && entry !== 'pr-preview') rmSync(entry, { recursive: true });
}
cpSync(carried, '.', { recursive: true });
cpSync(site, '.', { recursive: true });
rmSync(carried, { recursive: true });
writeFileSync(BUILDS_FILE, `${JSON.stringify(kept)}\n`);
