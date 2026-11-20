import type { ReactNode } from 'react';
import { View } from 'react-native';

import { NARROW_CSS_LOADS, narrowPart } from '@/theme/narrow';

/**
 * Children only a narrow page shows: hidden by narrow.css on a wide web page,
 * and not rendered at all off the web, where narrow.css never loads.
 */
export function NarrowOnly({ children }: { readonly children: ReactNode }) {
  return NARROW_CSS_LOADS ? <View {...narrowPart('narrow-only')}>{children}</View> : null;
}
