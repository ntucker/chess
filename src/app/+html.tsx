import { ScrollViewStyleReset, useServerDocumentContext } from 'expo-router/html';
import type { ReactNode } from 'react';

import { PRE_PAINT_SCRIPT, SCHEME_CSS } from '@/theme/schemeCss';

/**
 * Each web page's HTML document, rendered only by the export: Expo's own,
 * plus the theme's colors per scheme and the script that picks the
 * learner's before the page first paints (src/theme/schemeCss.ts).
 */
export default function Root({ children }: { readonly children: ReactNode }) {
  const { bodyAttributes, bodyNodes, htmlAttributes, headNodes } = useServerDocumentContext();
  return (
    <html lang="en" {...htmlAttributes}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <ScrollViewStyleReset />
        <style id="scheme" dangerouslySetInnerHTML={{ __html: SCHEME_CSS }} />
        <script dangerouslySetInnerHTML={{ __html: PRE_PAINT_SCRIPT }} />
        {headNodes}
      </head>
      <body {...bodyAttributes}>
        {children}
        {bodyNodes}
      </body>
    </html>
  );
}
