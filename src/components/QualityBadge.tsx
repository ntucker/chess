import { View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import type { EngineVerdict, ReviewQuality } from '@/analysis/quality';
import { Tip } from '@/components/Tip';
import { NO_CHANGE } from '@/evaluation/evaluation';
import { reviewRule } from '@/review/refine';
import { BADGE_BOX, badgeMarkup, qualityLooks } from '@/theme/moveQuality';

interface Props {
  readonly quality: ReviewQuality;
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

/** `QualityBadge` with what it means in a tooltip (`Tip`). */
export function TippedBadge({ tip, ...badge }: Props & { readonly tip: string }) {
  return (
    <Tip tip={tip}>
      <QualityBadge {...badge} />
    </Tip>
  );
}

/** What `verdictText` reads of a verdict. */
export type VerdictWords = Pick<EngineVerdict, 'quality' | 'change'>;

/**
 * Stockfish's verdict in words, for a badge's tooltip: "Stockfish:
 * Inaccuracy, 0.4 pawns worse for you". A move that changes nothing, like
 * the best, says only its label.
 */
export function verdictText({ quality, change: { description } }: VerdictWords) {
  const verdict = `Stockfish: ${qualityLooks[quality].name}`;
  if (description === NO_CHANGE) return verdict;
  return `${verdict}, ${description.charAt(0).toLowerCase()}${description.slice(1)}`;
}

/** A label's rule in words, for its badge's tooltip in the review: "Blunder: gave away 20% or more of the winning chances. Here: 26%." */
export const qualityTip = (quality: ReviewQuality, detail?: string) =>
  `${qualityLooks[quality].name}: ${reviewRule(quality)}.${detail ? ` ${detail}` : ''}`;
