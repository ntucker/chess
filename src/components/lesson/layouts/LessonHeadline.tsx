import { type News, StatusHeadline } from '@/components/GameStatus';
import { ReviewGameButton } from '@/components/ReviewLinks';

import type { LessonScreenModel } from '../useLessonScreen';

/**
 * The lesson's headline, with "Review the game" under it once the game
 * ends, drawing `news` of it on a phone (`headlineNews`).
 */
export function LessonHeadline({
  model: { headline, review },
  news,
}: {
  readonly model: Pick<LessonScreenModel, 'headline' | 'review'>;
  readonly news?: News;
}) {
  return (
    <StatusHeadline
      {...headline}
      eyebrowInHeader
      action={review.offered ? <ReviewGameButton href={review.href} /> : null}
      news={news}
    />
  );
}
