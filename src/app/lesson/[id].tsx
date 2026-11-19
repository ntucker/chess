import { AsyncBoundary } from '@data-client/react';
import { useLocalSearchParams } from 'expo-router';

import { BrowserOnly } from '@/components/BrowserOnly';
import { LessonPlaceholder, LessonScreen } from '@/components/lesson/LessonScreen';
import { LESSONS, type LessonId } from '@/resources/lesson';

/** One page per shipped lesson in the static export. */
export function generateStaticParams(): { id: LessonId }[] {
  return Object.keys(LESSONS).map((id) => ({ id: id as LessonId }));
}

/** A lesson, at /lesson/<id>. The exported page holds only its frame; the lesson loads in the browser. */
export default function LessonRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!Object.hasOwn(LESSONS, id)) return <LessonPlaceholder message="There is no lesson here." />;
  return (
    <BrowserOnly fallback={<LessonPlaceholder />}>
      <AsyncBoundary
        fallback={<LessonPlaceholder />}
        errorComponent={({ error }) => <LessonPlaceholder message={error.message} />}
      >
        <LessonScreen id={id as LessonId} />
      </AsyncBoundary>
    </BrowserOnly>
  );
}
