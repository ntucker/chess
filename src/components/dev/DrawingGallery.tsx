import { Button, Inline, Separator, Stack, Surface, Text, useTheme } from '@reactive/silk-native';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Drawing, Square, Tone } from '@/board/drawing';
import { type DrawingExample, drawingExamples } from '@/board/examples';
import Board from '@/components/Board';
import { Eyebrow } from '@/components/Eyebrow';
import { lastPosition, toUci } from '@/game/replay';
import { spotlight } from '@/theme/theme';

/**
 * Every drawing the board can make, one board per idea type, and a board that
 * previews a move on hover or press-and-hold. For checking the board and the
 * idea drawings by eye; the app doesn't link here.
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
            <PreviewDemo />
            <Separator />
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

/** The position the preview starts from: 1. e4 c6 2. d4, Black to move. */
const PREVIEW_LINE = ['e2e4', 'c7c6', 'd2d4'];

interface Candidate {
  readonly uci: string;
  readonly tone: Tone;
  /** What the move's idea draws once it's played. */
  readonly idea: readonly Drawing[];
}

const CANDIDATES: readonly Candidate[] = [
  {
    uci: 'd7d5',
    tone: 'main',
    idea: [
      { kind: 'arrow', from: 'd5', to: 'e4', tone: 'main' },
      { kind: 'ring', square: 'e4', tone: 'target' },
    ],
  },
  {
    uci: 'g7g6',
    tone: 'other',
    idea: [{ kind: 'arrow', from: 'f8', to: 'g7', tone: 'plan', step: 1, dashed: true }],
  },
];

const from = (uci: string) => uci.slice(0, 2) as Square;
const to = (uci: string) => uci.slice(2, 4) as Square;

/**
 * A move previewed as if played, with a ghost where its piece stood: the
 * board slides the piece there and back. Hover (or press and hold) a
 * candidate's piece or its square to preview it; click there to play it.
 */
function PreviewDemo() {
  const [line, setLine] = useState(PREVIEW_LINE);
  const [hovered, setHovered] = useState<Square | null>(null);
  const [held, setHeld] = useState<Square | null>(null);
  const [pressed, setPressed] = useState<Square>();

  const atStart = line.length === PREVIEW_LINE.length;
  const pointer = held ?? hovered;
  const previewed = atStart
    ? CANDIDATES.find(({ uci }) => pointer === from(uci) || pointer === to(uci))
    : undefined;
  const position = lastPosition(previewed ? [...line, previewed.uci] : line);
  const drawings: Drawing[] = previewed
    ? [
        { kind: 'ghost', square: from(previewed.uci), piece: { role: 'pawn', color: 'black' } },
        { kind: 'glow', square: to(previewed.uci), tone: previewed.tone },
        ...previewed.idea,
      ]
    : atStart
      ? CANDIDATES.flatMap(({ uci, tone }): Drawing[] => [
          { kind: 'glow', square: from(uci), tone },
          { kind: 'arrow', from: from(uci), to: to(uci), tone },
        ])
      : [];

  const press = (square: Square) => {
    setPressed(square);
    if (previewed && (square === from(previewed.uci) || square === to(previewed.uci))) {
      setLine([...line, previewed.uci]);
    }
  };

  return (
    <View style={styles.preview}>
      <View style={styles.previewBoard}>
        <FramedBoard>
          <Board
            fen={position.fen}
            orientation="black"
            turnColor={position.turn}
            movableColor={atStart && !previewed ? 'black' : undefined}
            dests={position.dests}
            lastMove={position.move ? [position.move.from, position.move.to] : undefined}
            check={position.check}
            drawings={drawings}
            onMove={(start, end) => setLine([...line, toUci(position, start, end)])}
            onHover={setHovered}
            onHold={setHeld}
            onPress={press}
            dom={{ style: styles.fill, scrollEnabled: false }}
          />
        </FramedBoard>
      </View>
      <Stack gap="4" style={styles.previewPanel}>
        <Stack gap="1">
          <Eyebrow>Preview</Eyebrow>
          <Text role="body">
            Hover a glowing pawn or where it goes, or press and hold it on a touch screen. Click
            to play the move.
          </Text>
        </Stack>
        <Stack gap="2">
          <Reading label="Mouse over" value={hovered} />
          <Reading label="Finger holds" value={held} />
          <Reading label="Last press" value={pressed} />
          <Reading label="Previewing" value={previewed?.uci} />
        </Stack>
        <Inline>
          <Button size="sm" variant="soft" disabled={atStart} onPress={() => setLine(PREVIEW_LINE)}>
            Start again
          </Button>
        </Inline>
      </Stack>
    </View>
  );
}

function Reading({ label, value }: { readonly label: string; readonly value?: string | null }) {
  return (
    <Inline gap="3" align="center">
      <Text role="caption" tone="secondary" style={styles.readingLabel}>
        {label}
      </Text>
      <Text role="bodySm" style={styles.mono}>
        {value ?? '—'}
      </Text>
    </Inline>
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
  preview: { flexDirection: 'row', flexWrap: 'wrap', gap: 32, alignItems: 'stretch' },
  previewBoard: { flexGrow: 1, flexShrink: 1, flexBasis: 300, maxWidth: 460 },
  previewPanel: { flexGrow: 1, flexShrink: 1, flexBasis: 260, maxWidth: 400 },
  readingLabel: { width: 112, textTransform: 'uppercase', letterSpacing: 1.2 },
  mono: { fontFamily: 'DMMono_400Regular' },
});
