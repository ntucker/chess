import { oklch } from '@reactive/silk-core/color';
import type { ConfigContext, ExpoConfig } from 'expo/config';
import {
  AndroidConfig,
  type ConfigPlugin,
  withAndroidManifest,
  withAndroidStyles,
  withMainActivity,
} from 'expo/config-plugins';

/** The plum stage behind the Android launcher icon and the splash screen. */
const STAGE = oklch(0.216, 0.054, 293);

const { addImports, appendContentsInsideDeclarationBlock } = AndroidConfig.CodeMod;

/**
 * Keeps the app running when Android's font size changes. Without it,
 * Android recreates the activity, which starts the app's screens over and
 * drops the game. RELAYOUT, below, lays the text out at the new size.
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
 * React Native lays its text out again at a new font size only when it is told
 * of the change while the app is in front, so the activity also does it when
 * it comes back after a change made in the system settings. React Native tells
 * JavaScript of the new size only on resume, so the activity also does that for
 * a change made while the app is in front.
 */
const RELAYOUT = `
  /** The font scale React Native's views were last laid out at; 0 before the first. */
  private var laidOutFontScale = 0f

  override fun onResume() {
    super.onResume()
    relayOutAtFontScale()
  }

  // React Native lays its text out again for a new font scale only when
  // something else dirties the tree in the same layout pass: its root takes
  // the new scale without dirtying itself (RootShadowNode::clone dirties only
  // for new size constraints). A change made while the app is in front gets
  // one; a change made while it was away doesn't, and keeps the old size.
  private fun relayOutAtFontScale() {
    val fontScale = resources.configuration.fontScale
    if (fontScale == laidOutFontScale) return
    val first = laidOutFontScale == 0f
    laidOutFontScale = fontScale
    if (first) return
    // React Native's own handler may not have run yet (Expo hands the delegate
    // its calls later), and both the text and JavaScript's event read these metrics.
    DisplayMetricsHolder.initDisplayMetrics(this)
    tellJavaScriptOfFontScale()
    relayOutReactViews(window.decorView)
  }

  // React Native tells JavaScript of a new font scale (useWindowDimensions)
  // only on resume, from its DeviceInfo module, whose class isn't public: a
  // change made while the app is in front needs telling too. app.config.test.ts
  // fails when a React Native upgrade breaks this.
  private fun tellJavaScriptOfFontScale() {
    val deviceInfo = reactHost?.currentReactContext
      ?.getNativeModule("DeviceInfo")
    (deviceInfo as? LifecycleEventListener)?.onHostResume()
  }

  // Measuring a root view one pixel taller hands React Native new size
  // constraints, which dirty the tree, so the text is measured again at the
  // new scale; the layout pass it asks for then measures it at its own size.
  private fun relayOutReactViews(view: View) {
    if (view is ReactRootView) {
      if (view.width > 0 && view.height > 0) {
        view.measure(
          View.MeasureSpec.makeMeasureSpec(view.width, View.MeasureSpec.EXACTLY),
          View.MeasureSpec.makeMeasureSpec(view.height + 1, View.MeasureSpec.EXACTLY),
        )
      }
      view.requestLayout()
    } else if (view is ViewGroup) {
      for (i in 0 until view.childCount) relayOutReactViews(view.getChildAt(i))
    }
  }
`;

/**
 * Gives Android's status and navigation bars the theme's icons: light on the
 * dark theme, dark on the light one. The app draws under both bars, so they
 * show its own background; the theme Android follows is the one AppTheme pins
 * (`pinTheme`, which sets AppCompat's night mode), so the activity reads it
 * from its own configuration.
 *
 * The activity is the bars' only writer, for its window and each of React
 * Native's modal windows (the settings sheet): two writers on one window undo
 * each other, so nothing in JavaScript styles the bars (no StatusBar).
 */
const SYSTEM_BAR_ICONS = `
  /** The windows of React Native's modals, which have bars of their own. */
  private val modalWindows = mutableSetOf<Window>()

  private val modalWindowListener =
    object : ExtraWindowEventListener {
      override fun onExtraWindowCreate(window: Window) {
        modalWindows += window
        showThemeInSystemBars(window)
      }

      override fun onExtraWindowDestroy(window: Window) {
        modalWindows -= window
      }
    }

  // A JavaScript reload starts a new React context, whose modals tell only it.
  private val reactContextListener =
    object : ReactInstanceEventListener {
      override fun onReactContextInitialized(context: ReactContext) {
        context.addExtraWindowEventListener(modalWindowListener)
      }
    }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    reactHost?.addReactInstanceEventListener(reactContextListener)
    reactHost?.currentReactContext?.addExtraWindowEventListener(modalWindowListener)
    showThemeInSystemBars()
  }

  override fun onDetachedFromWindow() {
    reactHost?.removeReactInstanceEventListener(reactContextListener)
    reactHost?.currentReactContext?.removeExtraWindowEventListener(modalWindowListener)
    super.onDetachedFromWindow()
  }

  private fun showThemeInSystemBars() {
    showThemeInSystemBars(window)
    modalWindows.forEach(::showThemeInSystemBars)
  }

  // The activity's configuration, not a new one handed to onConfigurationChanged:
  // AppCompat puts the pinned theme here, while a new configuration can carry the device's.
  @Suppress("DEPRECATION")
  private fun showThemeInSystemBars(window: Window) {
    val dark =
      resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK ==
        Configuration.UI_MODE_NIGHT_YES
    // Android 11 takes the older flags, as React Native's own bar code does there.
    if (Build.VERSION.SDK_INT > Build.VERSION_CODES.R) {
      val light =
        WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or
          WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
      window.insetsController?.setSystemBarsAppearance(if (dark) 0 else light, light)
    } else {
      val decor = window.decorView
      val light = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR or View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
      decor.systemUiVisibility =
        if (dark) decor.systemUiVisibility and light.inv() else decor.systemUiVisibility or light
    }
  }
`;

/** An activity takes one onConfigurationChanged, so the two fixes above share it. */
const CONFIGURATION_CHANGED = `
  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    showThemeInSystemBars()
    // While the app is away, onResume does it once the window can lay out.
    if (lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) relayOutAtFontScale()
  }
`;

const withMainActivityCode: ConfigPlugin = (config) =>
  withMainActivity(config, (activity) => {
    if (activity.modResults.language !== 'kt') {
      throw new Error('withMainActivityCode: MainActivity must be Kotlin');
    }
    let source = activity.modResults.contents;
    // Prebuild without --clean edits the MainActivity it made last time. One
    // made before SYSTEM_BAR_ICONS gets RELAYOUT twice and fails to build,
    // loudly rather than missing the bar code: prebuild with --clean.
    if (!source.includes('showThemeInSystemBars')) {
      source = addImports(
        source,
        [
          'android.content.res.Configuration',
          'android.os.Build',
          'android.view.View',
          'android.view.ViewGroup',
          'android.view.Window',
          'android.view.WindowInsetsController',
          'androidx.lifecycle.Lifecycle',
          'com.facebook.react.ReactInstanceEventListener',
          'com.facebook.react.ReactRootView',
          'com.facebook.react.bridge.LifecycleEventListener',
          'com.facebook.react.bridge.ReactContext',
          'com.facebook.react.interfaces.ExtraWindowEventListener',
          'com.facebook.react.uimanager.DisplayMetricsHolder',
        ],
        false,
      );
      source = appendContentsInsideDeclarationBlock(
        source,
        'class MainActivity',
        RELAYOUT + SYSTEM_BAR_ICONS + CONFIGURATION_CHANGED,
      );
    }
    activity.modResults.contents = source;
    return activity;
  });

/**
 * Android lays a grey or white scrim behind three-button navigation unless the
 * theme turns it off. The bars' icons take the theme's contrast instead
 * (SYSTEM_BAR_ICONS), so the app's background shows behind the buttons.
 */
const withNoNavigationBarScrim: ConfigPlugin = (config) =>
  withAndroidStyles(config, (styles) => {
    styles.modResults = AndroidConfig.Styles.assignStylesValue(styles.modResults, {
      add: true,
      parent: AndroidConfig.Styles.getAppThemeGroup(),
      name: 'android:enforceNavigationBarContrast',
      value: 'false',
      targetApi: '29',
    });
    return styles;
  });

const withAndroidNative: ConfigPlugin = (config) =>
  withMainActivityCode(withNoNavigationBarScrim(withLiveFontScale(config)));

/**
 * app.json, plus what uses a color (JSON can't call `oklch()`), and the GitHub
 * Pages build (.github/workflows/web.yml): when PAGES_BASE_PATH is set
 * (`/chess`, `/chess/pr-preview/pr-<number>` for a pull request preview, or
 * empty on a custom domain), the web export is served under that path.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const expo = config as ExpoConfig;
  const basePath = process.env.PAGES_BASE_PATH;
  return withAndroidNative({
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
