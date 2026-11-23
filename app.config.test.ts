import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// app.config.ts's live font scale fix calls React Native's internal DeviceInfo
// module by name. A React Native upgrade that renames it or stops it updating
// on resume leaves the fix doing nothing, silently: this test fails instead.
describe("React Native's DeviceInfo module", () => {
  const reactNative = dirname(require.resolve('react-native/package.json'));
  const read = (path: string) => readFileSync(join(reactNative, path), 'utf8');

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
