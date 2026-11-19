import { Stack, Surface, Text, useTheme } from '@reactive/silk-native';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { type DrawingExample, drawingExamples } from '@/board/examples';
import Board from '@/components/Board';
import { Eyebrow } from '@/components/Eyebrow';
import { lastPosition } from '@/game/replay';
import { fonts, spotlight } from '@/theme/theme';

/**
 * Every drawing the board can make, one board per idea type. For checking
 * the board and the idea drawings by eye; the app doesn't link here. Previews
 * on hover and press-and-hold are the lesson's own (src/lesson/board.ts).
 */
export function DrawingGallery() {
  const { theme } = useTheme();
  return (
    <View
      style={[
        styles.fill,
        { backgroundColor: theme.semantic.color.surface, backgroundImage: spotlight[theme.colorScheme] },
      ]}
    >
      <SafeAreaView style={styles.fill}>
        <ScrollView contentContainerStyle={styles.page}>
          <Stack gap="6" style={styles.column}>
            <Stack gap="2">
              <Eyebrow>For developers</Eyebrow>
              <Text role="headingLg" accessibilityRole="header">
                Board drawings
              </Text>
              <Text role="bodySm" tone="secondary">
                Every shape the board draws, in the positions an idea would draw it. Lessons
                choose the shapes; the board only draws them and reports the pointer.
              </Text>
            </Stack>
            <View style={styles.grid}>
              {drawingExamples.map((example) => (
                <ExampleCard key={example.title} example={example} />
              ))}
            </View>
          </Stack>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function ExampleCard({ example }: { readonly example: DrawingExample }) {
  const position = lastPosition(example.line);
  const kinds = [...new Set(example.drawings.map((drawing) => drawing.kind))];
  return (
    <Stack gap="3" style={styles.card}>
      <Stack gap="1">
        <Eyebrow>{example.title}</Eyebrow>
        <Text role="bodySm">{example.sentence}</Text>
      </Stack>
      <FramedBoard>
        <Board
          fen={position.fen}
          orientation="black"
          turnColor={position.turn}
          dests={{}}
          lastMove={position.move ? [position.move.from, position.move.to] : undefined}
          check={position.check}
          drawings={example.drawings}
          onMove={() => {}}
          dom={{ style: styles.fill, scrollEnabled: false }}
        />
      </FramedBoard>
      <Text role="caption" tone="secondary" style={styles.mono}>
        {kinds.join(' · ')}
      </Text>
    </Stack>
  );
}

function FramedBoard({ children }: { readonly children: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <Surface elevation="overlay" radius="md" border="subtle" style={styles.frame}>
      <View style={[styles.fill, { borderRadius: theme.semantic.radius.md - 1, overflow: 'hidden' }]}>
        {children}
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  page: { padding: 20, alignItems: 'center' },
  column: { width: '100%', maxWidth: 1100 },
  frame: { width: '100%', aspectRatio: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 32 },
  card: { flexGrow: 1, flexShrink: 1, flexBasis: 280, maxWidth: 340 },
  mono: { fontFamily: fonts.mono },
});
