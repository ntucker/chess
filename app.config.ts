import { oklch } from '@reactive/silk-core/color';
import type { ConfigContext, ExpoConfig } from 'expo/config';
import {
  AndroidConfig,
  type ConfigPlugin,
  withAndroidManifest,
  withMainActivity,
} from 'expo/config-plugins';

/** The plum stage behind the Android launcher icon and the splash screen. */
const STAGE = oklch(0.216, 0.054, 293);

const { addImports, appendContentsInsideDeclarationBlock } = AndroidConfig.CodeMod;

/**
 * Keeps the app running when Android's font size changes. Without it,
 * Android recreates the activity, which starts the app's screens over and
 * drops the game.
 *
 * React Native lays its text out again at the new size only when it is told
 * of the change while the app is in front, so the activity also does it when
 * it comes back after a change made in the system settings.
 */
const withLiveFontScale: ConfigPlugin = (config) =>
  withRelayout(
    withAndroidManifest(config, (manifest) => {
      const activity = AndroidConfig.Manifest.getMainActivityOrThrow(manifest.modResults);
      const changes = activity.$['android:configChanges']?.split('|') ?? [];
      if (!changes.includes('fontScale')) {
        activity.$['android:configChanges'] = [...changes, 'fontScale'].join('|');
      }
      return manifest;
    }),
  );

const RELAYOUT = `
  /** The font scale React Native's views were last laid out at; 0 before the first. */
  private var laidOutFontScale = 0f

  override fun onResume() {
    super.onResume()
    relayOutAtFontScale()
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    // While the app is away, onResume does it once the window can lay out.
    if (lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) relayOutAtFontScale()
  }

  // React Native lays text out again itself only for a change it is told of
  // while the app is in front (ReactHostImpl.onConfigurationChanged), so a
  // change made while the app was away would keep the old size.
  private fun relayOutAtFontScale() {
    val fontScale = resources.configuration.fontScale
    if (fontScale == laidOutFontScale) return
    val first = laidOutFontScale == 0f
    laidOutFontScale = fontScale
    if (first) return
    DisplayMetricsHolder.initDisplayMetrics(this)
    requestReactLayout(window.decorView)
  }

  private fun requestReactLayout(view: View) {
    if (view is ReactRootView) {
      view.requestLayout()
    } else if (view is ViewGroup) {
      for (i in 0 until view.childCount) requestReactLayout(view.getChildAt(i))
    }
  }
`;

const withRelayout: ConfigPlugin = (config) =>
  withMainActivity(config, (activity) => {
    if (activity.modResults.language !== 'kt') {
      throw new Error('liveFontScale: MainActivity must be Kotlin');
    }
    let source = activity.modResults.contents;
    if (!source.includes('relayOutAtFontScale')) {
      source = addImports(
        source,
        [
          'android.content.res.Configuration',
          'android.view.View',
          'android.view.ViewGroup',
          'androidx.lifecycle.Lifecycle',
          'com.facebook.react.ReactRootView',
          'com.facebook.react.uimanager.DisplayMetricsHolder',
        ],
        false,
      );
      source = appendContentsInsideDeclarationBlock(source, 'class MainActivity', RELAYOUT);
    }
    activity.modResults.contents = source;
    return activity;
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
