import { View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import type { MoveQuality } from '@/analysis/quality';
import { BADGE_BOX, badgeMarkup, qualityLooks } from '@/theme/moveQuality';

interface Props {
  readonly quality: MoveQuality;
  readonly size: number;
}

/** A move's label as a small colored disc with its glyph (a star for the best move, ?? for a blunder). */
export function QualityBadge({ quality, size }: Props) {
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={qualityLooks[quality].name}>
      <SvgXml
        xml={`<svg viewBox="0 0 ${BADGE_BOX} ${BADGE_BOX}">${badgeMarkup(quality)}</svg>`}
        width={size}
        height={size}
      />
    </View>
  );
}
