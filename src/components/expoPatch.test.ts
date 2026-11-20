import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// Upgrading Expo drops the patch in .yarn/patches without a word, since its
// resolution names the patched version. This fails instead, until the patch
// is made again for the new version (AGENTS.md, Native builds).
describe('the Expo patch', () => {
  it("is applied to Expo's DOM component wrapper", () => {
    const expo = dirname(require.resolve('expo/package.json'));
    const wrapper = readFileSync(join(expo, 'build/dom/webview-wrapper.js'), 'utf8');
    expect(wrapper).toContain('Opening Night patch');
  });
});
