import { oklch } from '@reactive/silk-core/color';
import type { ConfigContext, ExpoConfig } from 'expo/config';

/** The plum stage behind the Android launcher icon and the splash screen. */
const STAGE = oklch(0.216, 0.054, 293);

/**
 * app.json, plus the colors JSON can't write in OKLCH, and the GitHub Pages
 * build (.github/workflows/web.yml): when PAGES_BASE_PATH is set (`/chess`,
 * `/chess/pr-preview/pr-<number>` for a pull request preview, or empty on a
 * custom domain), the web export is served under that path.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const app = config as ExpoConfig;
  const expo: ExpoConfig = {
    ...app,
    android: {
      ...app.android,
      adaptiveIcon: { ...app.android?.adaptiveIcon, backgroundColor: STAGE },
    },
    plugins: app.plugins?.map((plugin) =>
      Array.isArray(plugin) && plugin[0] === 'expo-splash-screen'
        ? [plugin[0], { ...plugin[1], backgroundColor: STAGE }]
        : plugin,
    ),
  };
  const basePath = process.env.PAGES_BASE_PATH;
  if (basePath === undefined) return expo;
  return { ...expo, experiments: { ...expo.experiments, baseUrl: basePath } };
};
