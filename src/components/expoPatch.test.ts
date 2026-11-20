import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// Fails when an Expo upgrade drops .yarn/patches/expo-*.patch (AGENTS.md, Native builds).
describe('the Expo patch', () => {
  it("is applied to Expo's DOM component wrapper", () => {
    const expo = dirname(require.resolve('expo/package.json'));
    const wrapper = readFileSync(join(expo, 'build/dom/webview-wrapper.js'), 'utf8');
    expect(wrapper).toContain("if (!String(error).includes('Unable to find')) throw error;");
  });
});
