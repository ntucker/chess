import { LessonPage } from '@/components/lesson/LessonScreen';
import { HOME_LESSON } from '@/resources/lesson';

/** The home page: the lesson, until there are more openings to pick from. */
export default function HomeScreen() {
  return <LessonPage id={HOME_LESSON} />;
}
