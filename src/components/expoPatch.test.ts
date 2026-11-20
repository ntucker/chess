import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// Fails when an Expo upgrade drops .yarn/patches/expo-*.patch: run `yarn patch expo`
// on the new version and make the same change, or delete the patch and this test
// once Expo stops sending a DOM component's props before its page is ready.
describe('the Expo patch', () => {
  it("is applied to Expo's DOM component wrapper", () => {
    const expo = dirname(require.resolve('expo/package.json'));
    const wrapper = readFileSync(join(expo, 'build/dom/webview-wrapper.js'), 'utf8');
    expect(wrapper).toContain('if (!ready.current) return;');
  });
});
