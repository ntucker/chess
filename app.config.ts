import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * app.json, plus the GitHub Pages build (.github/workflows/web.yml): when
 * PAGES_BASE_PATH is set (`/chess`, or empty on a custom domain), export
 * static HTML instead of server rendering, under that path.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const basePath = process.env.PAGES_BASE_PATH;
  const expo = config as ExpoConfig;
  if (basePath === undefined) return expo;
  return {
    ...expo,
    web: { ...expo.web, output: 'static' },
    experiments: { ...expo.experiments, baseUrl: basePath },
  };
};
