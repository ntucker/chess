import { useLocalSearchParams } from 'expo-router';
import { use } from 'react';

import { useInBrowser } from '@/components/BrowserOnly';
import { OpeningList } from '@/components/OpeningList';
import { listPlace } from '@/lesson/openingList';
import { LessonIndexContext } from '@/resources/lesson';

/**
 * Every opening, at /openings: opened from the name of the opening above the
 * board, on top of the board's page. `?lesson=<id>&variation=<id>` names
 * where the board was, which the list marks. The exported page marks none:
 * the address's query is only read in the browser.
 */
export default function OpeningsRoute() {
  const { lesson, variation } = useLocalSearchParams<{ lesson?: string; variation?: string }>();
  const inBrowser = useInBrowser();
  const index = use(LessonIndexContext);
  return <OpeningList here={inBrowser ? listPlace(index, lesson, variation) : undefined} />;
}
