import Ionicons from '@expo/vector-icons/Ionicons';
import { Button, Inline } from '@reactive/silk-native';
import { type Href, useRouter } from 'expo-router';

import { Tip } from '@/components/Tip';
import { type Color, colorName } from '@/game/replay';

/** The review's mark: a line graph, as the review charts the game. */
const ICON = 'analytics-outline';
const LABEL = 'Review the game';

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
 * The Review button by the scoresheet's title: opens the review at `href` at
 * any point of the game once it has `started`. Before the game ends, its tip
 * says who `resigns` (`resigner`). Before the first move there is nothing to
 * review, and it shows disabled. `compact` draws only its icon, for a phone's
 * scoresheet page's head; screen readers hear its name either way.
 */
export function ScoresheetReview({
  href,
  started,
  resigns,
  compact,
}: {
  readonly href: Href;
  readonly started: boolean;
  readonly resigns?: Color;
  readonly compact?: boolean;
}) {
  const router = useRouter();
  const tip = !started
    ? 'Review opens after the first move.'
    : resigns && `Review the game so far, as if ${colorName(resigns)} resigned.`;
  const button = (
    <Button
      size="sm"
      variant="outline"
      disabled={!started}
      accessibilityLabel={LABEL}
      onPress={() => router.push(href)}
    >
      <Ionicons name={ICON} size={16} />
      {compact ? null : ' Review'}
    </Button>
  );
  if (!tip) return button;
  // Disabled, the button takes no focus, so the tip takes it to open from the keyboard.
  return (
    <Tip tip={tip} focusable={!started}>
      {button}
    </Tip>
  );
}
