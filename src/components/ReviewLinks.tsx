import Ionicons from '@expo/vector-icons/Ionicons';
import { Button, Inline } from '@reactive/silk-native';
import { type Href, useRouter } from 'expo-router';

import { Tip } from '@/components/Tip';
import type { Color } from '@/game/replay';
import type { LessonId } from '@/resources/lesson';

/** The review's mark: a line graph, as the review charts the game. */
const ICON = 'analytics-outline';
const LABEL = 'Review the game';

/**
 * The review of a game, at `/review?moves=…&side=…&lesson=…`: its moves from
 * the start, the learner's side, and the lesson it was played in, if any.
 */
export const reviewHref = (moves: readonly string[], side: Color, lesson?: LessonId): Href =>
  `/review?${new URLSearchParams({ moves: moves.join(' '), side, ...(lesson && { lesson }) })}`;

/** "Review the game", under the headline of a game that ended: opens its review on top of the game. */
export function ReviewGameButton({ href }: { readonly href: Href }) {
  const router = useRouter();
  return (
    <Inline>
      <Button onPress={() => router.push(href)}>
        <Ionicons name={ICON} size={15} /> {LABEL}
      </Button>
    </Inline>
  );
}

/**
 * The Review button by the scoresheet's title: opens the review at `href`,
 * or, with none, shows disabled, with why it doesn't open yet (`closed`) in
 * its tip. `compact` draws only its icon, for the narrow scoresheet drawer's
 * head; screen readers hear its name either way.
 */
export function ScoresheetReview({
  href,
  closed,
  compact,
}: {
  readonly href?: Href;
  readonly closed: string;
  readonly compact?: boolean;
}) {
  const router = useRouter();
  const button = (
    <Button
      size="sm"
      variant="outline"
      disabled={!href}
      accessibilityLabel={LABEL}
      onPress={() => href && router.push(href)}
    >
      <Ionicons name={ICON} size={16} />
      {compact ? null : ' Review'}
    </Button>
  );
  // Disabled, the button takes no focus, so the tip takes it to open from the keyboard.
  return href ? (
    button
  ) : (
    <Tip tip={closed} focusable>
      {button}
    </Tip>
  );
}
