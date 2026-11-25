import { ScrollViewStyleReset, useServerDocumentContext } from 'expo-router/html';
import type { ReactNode } from 'react';

import { SAVED_SIDE_CSS } from '@/components/savedSide';
import { BASE_PATH } from '@/files/basePath';
import { barMeta } from '@/theme/barColor';
import { PRE_PAINT_SCRIPT, SCHEME_CSS } from '@/theme/schemeCss';

/**
 * Each web page's HTML document, rendered only by the export: Expo's own, plus
 * - the theme's colors per scheme, and the script that runs before the page
 *   first paints (src/theme/schemeCss.ts): it picks the learner's scheme and
 *   names the side they last played;
 * - the rule that turns the home page's still board for that side
 *   (src/components/savedSide.ts);
 * - the browser bars' color in each scheme (src/theme/barColor.ts);
 * - the manifest that lets a phone add the site to its home screen as an app
 *   (public/manifest.webmanifest, written by scripts/make-brand.mjs).
 */
export default function Root({ children }: { readonly children: ReactNode }) {
  const { bodyAttributes, bodyNodes, htmlAttributes, headNodes } = useServerDocumentContext();
  return (
    <html lang="en" {...htmlAttributes}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta {...barMeta('light')} />
        <meta {...barMeta('dark')} />
        <link rel="manifest" href={`${BASE_PATH}/manifest.webmanifest`} />
        <ScrollViewStyleReset />
        <style id="scheme" dangerouslySetInnerHTML={{ __html: SCHEME_CSS }} />
        <script dangerouslySetInnerHTML={{ __html: PRE_PAINT_SCRIPT }} />
        <style id="saved-side" dangerouslySetInnerHTML={{ __html: SAVED_SIDE_CSS }} />
        {headNodes}
      </head>
      <body {...bodyAttributes}>
        {children}
        {bodyNodes}
      </body>
    </html>
  );
}
