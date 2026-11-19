import { useLocalSearchParams } from 'expo-router';

import { LessonPage } from '@/components/lesson/LessonScreen';
import { LESSONS, type LessonId } from '@/resources/lesson';

/** One page per shipped lesson in the static export. */
export function generateStaticParams(): { id: LessonId }[] {
  return Object.keys(LESSONS).map((id) => ({ id: id as LessonId }));
}

/** A lesson, at /lesson/<id>. */
export default function LessonRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <LessonPage id={id} />;
}
