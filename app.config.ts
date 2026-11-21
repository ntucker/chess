import { oklch } from '@reactive/silk-core/color';
import type { ConfigContext, ExpoConfig } from 'expo/config';
import { AndroidConfig, type ConfigPlugin, withAndroidManifest } from 'expo/config-plugins';

/** The plum stage behind the Android launcher icon and the splash screen. */
const STAGE = oklch(0.216, 0.054, 293);

/**
 * Lets Android hand a change of the system font size to the running app
 * instead of recreating its activity, which restarts the app's screens and
 * drops the game. React Native lays text out again at the new size itself.
 */
const withLiveFontScale: ConfigPlugin = (config) =>
  withAndroidManifest(config, (manifest) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(manifest.modResults);
    const changes = activity.$['android:configChanges']?.split('|') ?? [];
    if (!changes.includes('fontScale')) {
      activity.$['android:configChanges'] = [...changes, 'fontScale'].join('|');
    }
    return manifest;
  });

/**
 * app.json, plus what uses a color (JSON can't call `oklch()`), and the GitHub
 * Pages build (.github/workflows/web.yml): when PAGES_BASE_PATH is set
 * (`/chess`, `/chess/pr-preview/pr-<number>` for a pull request preview, or
 * empty on a custom domain), the web export is served under that path.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const expo = config as ExpoConfig;
  const basePath = process.env.PAGES_BASE_PATH;
  return withLiveFontScale({
    ...expo,
    android: {
      ...expo.android,
      adaptiveIcon: {
        backgroundColor: STAGE,
        foregroundImage: './assets/images/android-icon-foreground.png',
        backgroundImage: './assets/images/android-icon-background.png',
        monochromeImage: './assets/images/android-icon-monochrome.png',
      },
    },
    plugins: [
      ...(expo.plugins ?? []),
      [
        'expo-splash-screen',
        { backgroundColor: STAGE, image: './assets/images/splash-icon.png', imageWidth: 220 },
      ],
    ],
    experiments:
      basePath === undefined ? expo.experiments : { ...expo.experiments, baseUrl: basePath },
  });
};
