import Ionicons from '@expo/vector-icons/Ionicons';
import { Button } from '@reactive/silk-native';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

import { Tip } from '@/components/Tip';
import { TOUCH_TARGET } from '@/theme/touch';

import type { ReviewView } from './ReviewPanel';

type Props = Pick<ReviewView, 'ply' | 'nextMoment' | 'goto'>;

/** Retry and Show best, which come with retrying a moment; until then they do nothing. */
const IDLE = [
  { icon: 'refresh', name: 'Retry', tip: 'Retry: play this move again' },
  { icon: 'bulb-outline', name: 'Show best', tip: "Show best: Stockfish's best move here" },
] as const satisfies readonly {
  icon: ComponentProps<typeof Ionicons>['name'];
  name: string;
  tip: string;
}[];

/**
 * The review's three actions in the panel beside the board: Retry and Show
 * best as icons named by their tooltips, and Next moment (First moment at
 * the start), which goes to the earliest moment not visited yet.
 */
export function ReviewActions({ ply, nextMoment, goto }: Props) {
  return (
    <View style={styles.row}>
      {IDLE.map(({ icon, tip }) => (
        // Disabled, the button takes no focus, so the tip takes it to open from the keyboard.
        <Tip key={icon} tip={tip} focusable>
          <Button variant="outline" disabled accessibilityLabel={tip}>
            <Ionicons name={icon} size={17} />
          </Button>
        </Tip>
      ))}
      <View style={styles.spacer} />
      <NextMoment ply={ply} nextMoment={nextMoment} goto={goto} />
    </View>
  );
}

/**
 * The same actions on a narrow page, fixed at the screen's foot so they stay
 * in reach while the panel scrolls: three buttons a thumb's height, sharing
 * the width, each with its icon and its name.
 */
export function ReviewActionBar({ ply, nextMoment, goto }: Props) {
  return (
    <View role="toolbar" aria-label="Review actions" style={styles.bar}>
      {IDLE.map(({ icon, name, tip }) => (
        <Tip key={icon} tip={tip} focusable style={styles.grow}>
          <Button variant="outline" disabled accessibilityLabel={tip} style={styles.barButton}>
            <Ionicons name={icon} size={16} />
            {` ${name}`}
          </Button>
        </Tip>
      ))}
      <View style={styles.grow}>
        <NextMoment ply={ply} nextMoment={nextMoment} goto={goto} short style={styles.barButton} />
      </View>
    </View>
  );
}

/**
 * Next moment, or First moment at the start: disabled once every moment
 * has been visited. `short` names it in one word, for the bar's third of a
 * phone's width; screen readers hear the whole name either way.
 */
function NextMoment({
  ply,
  nextMoment,
  goto,
  short,
  style,
}: Props & {
  readonly short?: boolean;
  readonly style?: ComponentProps<typeof Button>['style'];
}) {
  const [word, name] = ply === 0 ? ['First', 'First moment'] : ['Next', 'Next moment'];
  return (
    <Button
      disabled={nextMoment === undefined}
      onPress={() => nextMoment !== undefined && goto(nextMoment)}
      accessibilityLabel={name}
      style={style}
    >
      {`${short ? word : name} `}
      <Ionicons name="arrow-forward" size={15} />
    </Button>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  spacer: { flexGrow: 1 },
  bar: { flexDirection: 'row', gap: 8 },
  grow: { flex: 1 },
  // Silk's button keeps to its content's width; here it fills its share.
  barButton: { width: '100%', height: TOUCH_TARGET, paddingHorizontal: 6 },
});
