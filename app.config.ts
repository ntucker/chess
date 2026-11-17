import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * app.json, plus the changes for the GitHub Pages build
 * (.github/workflows/web.yml), which sets PAGES_BASE_PATH to the path the
 * site is served from (`/chess`, or empty on a custom domain). Pages only
 * serves files, so the web build is exported as static HTML instead of
 * server-rendered, and every URL in it starts with that path.
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
