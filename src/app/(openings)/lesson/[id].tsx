import { LESSONS, type LessonId } from '@/resources/lesson';

/** One page per shipped lesson in the static export. */
export function generateStaticParams(): { id: LessonId }[] {
  return Object.keys(LESSONS).map((id) => ({ id: id as LessonId }));
}

/** A lesson picked, at /lesson/<id>: the openings page with its first move played. Drawn by `../_layout.tsx`. */
export default function LessonRoute() {
  return null;
}
