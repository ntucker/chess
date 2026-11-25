import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const reactNative = dirname(require.resolve('react-native/package.json'));
const read = (path: string) => readFileSync(join(reactNative, path), 'utf8');
/** A file of React Native's Android library. */
const readAndroid = (path: string) => read(join('ReactAndroid/src/main', path));

// app.config.ts's live font scale fix calls React Native's internal DeviceInfo
// module by name. A React Native upgrade that renames it or stops it updating
// on resume leaves the fix doing nothing, silently: this test fails instead.
describe("React Native's DeviceInfo module", () => {
  it('is named DeviceInfo', () => {
    expect(read('src/private/specs_DEPRECATED/modules/NativeDeviceInfo.js')).toContain(
      "getEnforcing<Spec>('DeviceInfo')",
    );
  });

  it('tells JavaScript of a new font scale on resume', () => {
    const module = read(
      'ReactAndroid/src/main/java/com/facebook/react/modules/deviceinfo/DeviceInfoModule.kt',
    );
    expect(module).toMatch(
      /class DeviceInfoModule\([^)]*\) :\s*NativeDeviceInfoSpec\([^)]*\), LifecycleEventListener/,
    );
    expect(module).toMatch(
      /override fun onHostResume\(\) \{[^}]*fontScale[^}]*emitUpdateDimensionsEvent\(\)/,
    );
  });
});

// SYSTEM_BAR_ICONS in app.config.ts styles the bars of React Native's modal
// windows from the activity, and relies on React Native leaving their icons
// alone. An upgrade that changes either fails here instead of showing the
// wrong icons over the settings sheet.
describe("React Native's modal windows", () => {
  it('tell the activity when they open and close', () => {
    const modal = readAndroid('java/com/facebook/react/views/modal/ReactModalHostView.kt');
    expect(modal).toContain('.onExtraWindowCreate(window)');
    expect(modal).toContain('.onExtraWindowDestroy(window)');
  });

  it("take the app theme's navigation bar contrast, which turns off the icon writes", () => {
    // The dialog theme has no parent, so the activity's theme fills in the rest.
    expect(readAndroid('res/views/modal/values/themes.xml')).toMatch(
      /<style name="Theme\.FullScreenDialog">(?:(?!<\/style>)(?!enforceNavigationBarContrast)[\s\S])*<\/style>/,
    );
    // Edge to edge sets a window's navigation icons only where contrast is enforced.
    expect(readAndroid('java/com/facebook/react/views/view/WindowUtil.kt')).toMatch(
      /if \(enforceNavigationBarContrast\) \{\s*insetsController\.isAppearanceLightNavigationBars/,
    );
  });
});
