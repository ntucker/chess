import { Badge, Pressable, Stack, Text, useTheme } from '@reactive/silk-native';
import { Link, useRouter } from 'expo-router';
import {
  type ComponentRef,
  Fragment,
  type ReactNode,
  use,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { Text as RNText, StyleSheet, View } from 'react-native';

import { Eyebrow } from '@/components/Eyebrow';
import { plainPress } from '@/components/FootnoteLink';
import { goBack } from '@/components/navigation';
import { Page } from '@/components/Page';
import { SourceCredits } from '@/components/lesson/SourceCredits';
import { STAGE_MAX } from '@/components/Stage';
import { type Color, COLORS, colorName } from '@/game/replay';
import type { VariationId } from '@/lesson/lesson';
import { variationHref } from '@/lesson/openings';
import {
  type ListedOpening,
  type ListedVariation,
  type ListPlace,
  openingList,
} from '@/lesson/openingList';
import { LessonIndexContext, type LessonId } from '@/resources/lesson';
import { fonts } from '@/theme/theme';

/**
 * Every opening the app teaches, by the side the learner plays, each with
 * its variations as a tree: a page on top of the board's, as a phone stacks
 * screens. Picking a line goes back to the board's page and starts it at
 * that line. Back, or the line the board was in (`here`), returns to the
 * board as it was left, since the page underneath stays mounted.
 */
export function OpeningList({ here }: { readonly here?: ListPlace<LessonId> }) {
  const index = use(LessonIndexContext);
  const openings = useMemo(() => openingList(index), [index]);
  return (
    <Page
      title="Openings · Opening Night"
      header={{
        place: { name: 'Openings' },
        back: {
          href: here ? variationHref(here.lesson, here.variation) : '/',
          label: 'Back to the board',
        },
      }}
      maxWidth={STAGE_MAX}
    >
      <View style={styles.content}>
        <Stack gap="2">
          <Eyebrow>The program</Eyebrow>
          <Text role="headingXl" accessibilityRole="header" style={styles.title}>
            Every opening
          </Text>
          <Text role="body" tone="secondary">
            Pick a line to play it from its first move. Going back keeps the game you left.
          </Text>
        </Stack>
        {COLORS.map((side) => (
          <SideSection key={side} side={side} openings={openings[side]} here={here} />
        ))}
      </View>
    </Page>
  );
}

function SideSection({
  side,
  openings,
  here,
}: {
  readonly side: Color;
  readonly openings: readonly ListedOpening<LessonId>[];
  readonly here?: ListPlace<LessonId>;
}) {
  const { theme } = useTheme();
  if (!openings.length) return null;
  return (
    <View style={styles.side}>
      <View style={[styles.sideHead, { borderBottomColor: theme.semantic.color.borderSubtle }]}>
        <Eyebrow>Playing {colorName(side)}</Eyebrow>
      </View>
      {openings.map((opening) => (
        <OpeningEntry
          key={opening.id}
          opening={opening}
          here={here?.lesson === opening.id ? (here.variation ?? opening.root.id) : undefined}
        />
      ))}
    </View>
  );
}

/** One opening: its name, which opens it, then its variations; `here` is the one the board was in. */
function OpeningEntry({
  opening,
  here,
}: {
  readonly opening: ListedOpening<LessonId>;
  readonly here?: VariationId;
}) {
  const { root } = opening;
  return (
    <View style={styles.opening}>
      <LineLink
        lesson={opening.id}
        variation={root}
        here={here === root.id}
        depth={0}
        tag={here === undefined ? undefined : <NowPlaying />}
      />
      <View style={styles.rows}>
        <VariationRows lesson={opening.id} variations={root.children} depth={1} here={here} />
      </View>
      <View style={styles.credits}>
        <SourceCredits sources={opening.sources} />
      </View>
    </View>
  );
}

/** `variations` at `depth` of the tree (1 under the opening), each followed by those under it. */
function VariationRows({
  lesson,
  variations,
  depth,
  here,
}: {
  readonly lesson: LessonId;
  readonly variations: readonly ListedVariation[];
  readonly depth: number;
  readonly here?: VariationId;
}) {
  return variations.map((variation) => (
    <Fragment key={variation.id}>
      <LineLink lesson={lesson} variation={variation} here={here === variation.id} depth={depth} />
      <VariationRows
        lesson={lesson}
        variations={variation.children}
        depth={depth + 1}
        here={here}
      />
    </Fragment>
  ));
}

function NowPlaying() {
  return (
    <Badge variant="soft" tone="accent" size="sm">
      {/* Plain text, so it keeps the badge's ink and size and adds only the capitals. */}
      <RNText style={styles.nowText}>Now playing</RNText>
    </Badge>
  );
}

/**
 * A variation as a row of the program: its name, a dotted leader, its moves.
 * On a narrow page the moves drop below, right-aligned. The variation the
 * board was in (`here`) is marked, and goes back to the board as it was;
 * any other opens the board's page at its line. `depth` 0 is the opening's
 * own heading, with `tag` beside its name; each depth past 1 hangs further in.
 */
function LineLink({
  lesson,
  variation,
  here,
  depth,
  tag,
}: {
  readonly lesson: LessonId;
  readonly variation: ListedVariation;
  readonly here: boolean;
  readonly depth: number;
  readonly tag?: ReactNode;
}) {
  const router = useRouter();
  const { theme } = useTheme();
  const { color } = theme.semantic;
  const { accent, neutral } = color.tones;
  const href = variationHref(lesson, variation.id);
  // The list opens on where the board was, however far down it is.
  const row = useRef<ComponentRef<typeof View>>(null);
  useEffect(() => {
    if (here) scrollIntoView(row.current);
  }, [here]);
  return (
    <Link
      href={href}
      asChild
      onPress={(event) => {
        if (!plainPress(event)) return;
        event.preventDefault();
        // Another line leaves the list for the board as if picked there.
        goBack(router, href, here ? undefined : href);
      }}
    >
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${variation.name}, ${variation.line}${here ? ', where you are: back to your game' : ''}`}
        style={styles.link}
      >
        {({ hovered, pressed }) => {
          const ink = here ? accent.text : color.textPrimary;
          return (
            <View
              ref={row}
              style={[
                styles.row,
                depth > 1 && {
                  ...styles.subRow,
                  marginLeft: SUB_INDENT * (depth - 1),
                  borderLeftColor: color.borderSubtle,
                },
                here && { backgroundColor: accent.subtle },
                (hovered || pressed) && {
                  backgroundColor: here ? accent.subtleHover : neutral.subtle,
                },
              ]}
            >
              {here ? <View style={[styles.dot, { backgroundColor: accent.solid }]} /> : null}
              <View style={styles.name}>
                <Text
                  role={NAME_ROLE[Math.min(depth, 2)]}
                  style={[depth === 0 && styles.openingName, { color: ink }]}
                >
                  {variation.name}
                </Text>
                {tag}
              </View>
              <View style={[styles.leader, { borderBottomColor: neutral.border }]} />
              <Text role="caption" tone="secondary" style={styles.line}>
                {variation.line}
              </Text>
            </View>
          );
        }}
      </Pressable>
    </Link>
  );
}

/** Scrolls the page so `row` is in the middle of the window (web only: a native row has no DOM node). */
function scrollIntoView(row: ComponentRef<typeof View> | null) {
  const node = row as unknown as { scrollIntoView?: (options: object) => void } | null;
  node?.scrollIntoView?.({ block: 'center' });
}

/** The list's width: one column, a program's page, wide enough for a long line beside its name. */
const CONTENT_MAX = 760;
const DOT = 8;
/** How far each level of sub-variation hangs in from the one above. */
const SUB_INDENT = 22;
/** A row's name, by depth: the opening's heading, a variation, a sub-variation. */
const NAME_ROLE = ['headingLg', 'body', 'bodySm'] as const;

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: CONTENT_MAX, gap: 40, paddingTop: 12, paddingBottom: 48 },
  title: { fontFamily: fonts.display },
  side: { gap: 28 },
  sideHead: { borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 8 },
  opening: { gap: 6 },
  openingName: { fontFamily: fonts.display },
  nowText: { textTransform: 'uppercase', letterSpacing: 1.2 },
  rows: { gap: 2 },
  link: { borderRadius: 8, outlineOffset: -2 },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    columnGap: 10,
    rowGap: 2,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
  // A sub-variation hangs off its parent's row on a thin rule.
  subRow: { borderLeftWidth: 1, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2, alignSelf: 'center' },
  name: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12 },
  // Dots from the name to the moves, as a printed program sets its pages.
  leader: {
    flexGrow: 1,
    minWidth: 24,
    borderBottomWidth: 1,
    borderStyle: 'dotted',
    alignSelf: 'center',
    marginTop: 6,
  },
  line: { fontFamily: fonts.mono, fontSize: 13, marginLeft: 'auto', textAlign: 'right' },
  credits: { paddingHorizontal: 10, paddingTop: 4 },
});
