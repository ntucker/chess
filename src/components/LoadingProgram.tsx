import { Skeleton, Stack, Surface, useTheme } from '@reactive/silk-native';
import { StyleSheet, View } from 'react-native';

import { Eyebrow } from '@/components/Eyebrow';
import { useNarrowPart } from '@/theme/Narrow';

interface Props {
  /** The page's eyebrow: the lesson's name once it is known. */
  readonly eyebrow: string;
  /** What screen readers hear is loading; nothing on screen says it. */
  readonly label: string;
}

/** The candidate rows' widths, in points, so the outline reads as a list of moves. */
const ROWS = [44, 32, 38, 28];

/**
 * The panel beside the board while its page loads: the page's eyebrow over
 * the outline of a headline and the candidate list, pulsing in the stage's
 * plum, so the panel looks like itself before its words arrive.
 */
export function LoadingProgram({ eyebrow, label }: Props) {
  const part = useNarrowPart();
  const { theme } = useTheme();
  const bone = { backgroundColor: theme.semantic.color.tones.neutral.subtle };
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      style={styles.program}
    >
      <Stack gap="2">
        <View {...part('wide-only')}>
          <Eyebrow>{eyebrow}</Eyebrow>
        </View>
        <Skeleton style={[bone, styles.title]} />
        <Skeleton {...part('wide-only', [bone, styles.detail])} />
      </Stack>
      <Surface elevation="sunken" border="subtle" radius="md" style={styles.list}>
        {ROWS.map((width, row) => (
          <View key={row} style={styles.row}>
            <Skeleton shape="circle" style={[bone, styles.dot]} />
            <Skeleton style={[bone, styles.san, { width }]} />
            <Skeleton style={[bone, styles.track]} />
          </View>
        ))}
      </Surface>
    </View>
  );
}

// Sized like the headline's lines and the candidate list's rows (CandidateList.tsx).
const styles = StyleSheet.create({
  program: { minHeight: 200, gap: 24 },
  title: { height: 28, width: '60%', borderRadius: 6 },
  detail: { height: 12, width: '85%', borderRadius: 4 },
  list: { paddingHorizontal: 16, paddingVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  dot: { width: 10, height: 10 },
  san: { height: 14, borderRadius: 4, marginRight: 'auto' },
  track: { width: 52, height: 4, borderRadius: 2 },
});
