import { AsyncBoundary } from "@data-client/react";
import { useLocalSearchParams } from "expo-router";
import { useSyncExternalStore } from "react";

import {
  LessonPlaceholder,
  LessonScreen,
} from "@/components/lesson/LessonScreen";
import { LESSONS, type LessonId } from "@/resources/lesson";

/** One page per shipped lesson in the static export. */
export function generateStaticParams(): { id: LessonId }[] {
  return Object.keys(LESSONS).map((id) => ({ id: id as LessonId }));
}

/**
 * A lesson, at /lesson/<id>. The exported page holds only its frame: reading
 * the lesson while the page is rendered on the server hangs the export, so
 * the lesson loads once the page runs in the browser.
 */
export default function LessonRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const inBrowser = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
  if (!Object.hasOwn(LESSONS, id))
    return <LessonPlaceholder message="There is no lesson here." />;
  if (!inBrowser) return <LessonPlaceholder />;
  return (
    <AsyncBoundary
      fallback={<LessonPlaceholder />}
      errorComponent={({ error }) => (
        <LessonPlaceholder message={error.message} />
      )}
    >
      <LessonScreen id={id as LessonId} />
    </AsyncBoundary>
  );
}

const subscribeNever = () => () => {};
