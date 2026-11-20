/// <reference types="node" />
import { beforeEach, describe, expect, it } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const SCRIPT = join(__dirname, 'replace-site.mjs');

let root: string;
let pages: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'replace-site-'));
  pages = join(root, 'pages');
  mkdirSync(pages);
});

/** Writes each of `files` into `dir`, with its path and `tag` as its content. */
function write(dir: string, files: readonly string[], tag = '') {
  for (const file of files) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), file + tag);
  }
}

/** Publishes a build made of `files` over the site in `pages`. */
function publish(name: string, files: readonly string[]) {
  const site = join(root, name);
  write(site, files, name);
  execFileSync(process.execPath, [SCRIPT, site], { cwd: pages });
}

/** Every file in the site, as sorted paths. */
const siteFiles = () =>
  readdirSync(pages, { recursive: true, encoding: 'utf8' })
    .map((path) => path.replaceAll('\\', '/'))
    .filter((path) => statSync(join(pages, path)).isFile())
    .sort();

/** A build whose page loads `maia-<hash>.js`, the way Expo names the Maia worker. */
const build = (hash: string) => [
  'index.html',
  `_expo/static/js/web/maia-${hash}.js`,
  'assets/assets/maia/maia-1500.b09c.bin',
];

describe('replace-site', () => {
  it("keeps the last build's hashed files, so a page opened before the deploy still loads them", () => {
    publish('first', [...build('aaa'), 'play.html', '_expo/.routes.json']);
    publish('second', build('bbb'));

    expect(siteFiles()).toEqual([
      '.builds.json',
      '_expo/static/js/web/maia-aaa.js',
      '_expo/static/js/web/maia-bbb.js',
      'assets/assets/maia/maia-1500.b09c.bin',
      'index.html',
    ]);
  });

  it('takes its HTML from the new build only', () => {
    write(pages, ['index.html'], 'old');
    publish('next', ['index.html']);
    expect(siteFiles()).toEqual(['.builds.json', 'index.html']);
    expect(readFileSync(join(pages, 'index.html'), 'utf8')).toBe('index.htmlnext');
    expect(existsSync(join(pages, '_expo'))).toBe(false);
  });

  it('counts a site published before it as one build', () => {
    write(pages, [...build('old'), 'play.html']);
    publish('next', build('new'));
    expect(siteFiles()).toContain('_expo/static/js/web/maia-old.js');
    expect(siteFiles()).not.toContain('play.html');
  });

  it('leaves pull request previews alone', () => {
    write(pages, ['pr-preview/pr-7/index.html', 'pr-preview/pr-7/_expo/static/js/web/maia-x.js']);
    publish('next', build('new'));
    expect(siteFiles()).toEqual(
      expect.arrayContaining([
        'pr-preview/pr-7/_expo/static/js/web/maia-x.js',
        'pr-preview/pr-7/index.html',
      ]),
    );
  });

  it('drops the files of builds older than the last 10, unless a newer one has them too', () => {
    for (let n = 0; n <= 10; n++) publish(`build-${n}`, build(`h${n}`));

    const files = siteFiles();
    expect(files).not.toContain('_expo/static/js/web/maia-h0.js');
    expect(files).toContain('_expo/static/js/web/maia-h1.js');
    expect(files).toContain('_expo/static/js/web/maia-h10.js');
    expect(files).toContain('assets/assets/maia/maia-1500.b09c.bin');
  });

  it('keeps one place for a build published twice, as a re-run does', () => {
    publish('first', build('aaa'));
    for (let n = 0; n < 10; n++) publish('again', build('bbb'));
    expect(siteFiles()).toContain('_expo/static/js/web/maia-aaa.js');
  });
});
