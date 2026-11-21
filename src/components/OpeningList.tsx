import Ionicons from '@expo/vector-icons/Ionicons';
import { a11yState, Badge, Pressable, Stack, Text, useTheme } from '@reactive/silk-native';
import { Link, useRouter } from 'expo-router';
import {
  type ComponentRef,
  type ReactNode,
  use,
  useEffect,
  useMemo,
  useRef,
  useState,
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
  listedPath,
  type ListedOpening,
  type ListedVariation,
  type ListPlace,
  openingList,
} from '@/lesson/openingList';
import { LessonIndexContext, type LessonId } from '@/resources/lesson';
import { narrowLength, narrowStyles } from '@/theme/narrow';
import { useNarrowStyles } from '@/theme/Narrow';
import { fonts, typography } from '@/theme/theme';

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
  const router = useRouter();
  return (
    <Page
      title="Openings · Opening Night"
      header={{
        place: { name: 'Openings' },
        back: {
          href: here ? variationHref(here.lesson, here.variation) : '/',
          label: 'Back to the board',
        },
        // To the board, started over: Back from there returns to the game left.
        onRestart: () => goBack(router, '/', '/'),
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
  const spacing = useNarrowStyles(STYLES);
  if (!openings.length) return null;
  return (
    <View style={styles.side}>
      <View style={[styles.sideHead, { borderBottomColor: theme.semantic.color.borderSubtle }]}>
        <Eyebrow>Playing {colorName(side)}</Eyebrow>
      </View>
      <View style={spacing.openings}>
        {openings.map((opening, index) => (
          <OpeningEntry
            lastOfSide={index === openings.length - 1}
            key={opening.id}
            opening={opening}
            here={here?.lesson === opening.id ? (here.variation ?? opening.root.id) : undefined}
          />
        ))}
      </View>
    </View>
  );
}

/**
 * One opening: its name, then its variations as a tree, each branch closed
 * but those on the way to `here`, the variation the board was in. Its
 * sources' credits show under its variations, while they show.
 */
function OpeningEntry({
  opening,
  here,
  lastOfSide,
}: {
  readonly opening: ListedOpening<LessonId>;
  readonly here?: VariationId;
  readonly lastOfSide: boolean;
}) {
  const { root } = opening;
  const spacing = useNarrowStyles(STYLES);
  return (
    <View style={styles.opening}>
      <Branch
        lesson={opening.id}
        variation={root}
        depth={0}
        path={listedPath(root, here)}
        // The heading keeps the chevron's column too, so its name lines up with its variations'.
        gutter
        tag={here === undefined ? undefined : <NowPlaying />}
        footer={
          <View style={[spacing.credits, lastOfSide && styles.lastOfSideCredits]}>
            <SourceCredits sources={opening.sources} />
          </View>
        }
      />
    </View>
  );
}

/**
 * `variation`'s row at `depth` of the tree (0 for the opening), then, while
 * it is open, the branches under it, hung from its chevron on a thin rule.
 * `path` is the way to the variation the board was in, which ends there: a
 * branch on it starts open, and the learner's own toggle wins from then on.
 * `gutter` keeps the chevron's space before a row without one, when a row
 * beside it has one, so the names in a column line up. `footer` follows the
 * branches under it, and shows and hides with them.
 */
function Branch({
  lesson,
  variation,
  depth,
  path,
  gutter,
  tag,
  footer,
}: {
  readonly lesson: LessonId;
  readonly variation: ListedVariation;
  readonly depth: number;
  readonly path: readonly VariationId[];
  readonly gutter: boolean;
  readonly tag?: ReactNode;
  readonly footer?: ReactNode;
}) {
  const { theme } = useTheme();
  const [toggled, setToggled] = useState<boolean>();
  const { children } = variation;
  // Whether the variations under it show; none for a variation without any.
  const open = children.length ? (toggled ?? path.includes(variation.id)) : undefined;
  // The rows under it keep a chevron's space when one of them has a chevron.
  const childGutter = children.some((child) => child.children.length > 0);
  return (
    <>
      <View style={styles.branch}>
        {open === undefined ? (
          gutter && <View style={styles.toggle} />
        ) : (
          <BranchToggle
            name={variation.name}
            depth={depth}
            open={open}
            onPress={() => setToggled(!open)}
          />
        )}
        <LineLink
          lesson={lesson}
          variation={variation}
          here={variation.id === path.at(-1)}
          depth={depth}
          tag={tag}
        />
      </View>
      {open === undefined ? (
        footer
      ) : (
        // A closed branch stays mounted, only hidden: the branches under it
        // keep the learner's toggles, and the row the board was in scrolls
        // into view once, not each time its branch reopens.
        <View
          style={[
            styles.rows,
            depth > 0 && {
              ...styles.subRows,
              borderLeftColor: theme.semantic.color.borderSubtle,
            },
            !open && styles.closed,
          ]}
        >
          {children.map((child) => (
            <Branch
              key={child.id}
              lesson={lesson}
              variation={child}
              depth={depth + 1}
              path={path}
              gutter={childGutter}
            />
          ))}
          {footer}
        </View>
      )}
    </>
  );
}

/** The chevron before a variation's row that shows or hides those under it. */
function BranchToggle({
  name,
  depth,
  open,
  onPress,
}: {
  readonly name: string;
  readonly depth: number;
  readonly open: boolean;
  readonly onPress: () => void;
}) {
  const { theme } = useTheme();
  const { color } = theme.semantic;
  const role = typography[nameRole(depth)];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Variations of ${name}`}
      {...a11yState({ expanded: open })}
      // At least 44 points to a finger's press, past the chevron's 28 and its row's height.
      hitSlop={HIT_SLOP}
      onPress={onPress}
      // Level with the name's first line, however the row wraps.
      style={[styles.toggle, { height: 2 * ROW_PAD + role.size * role.lineHeight }]}
    >
      {({ hovered, pressed }) => (
        <View
          style={[
            styles.toggleFace,
            (hovered || pressed) && { backgroundColor: color.tones.neutral.subtle },
          ]}
        >
          <Ionicons
            name="chevron-forward"
            size={CHEVRON}
            color={hovered || pressed ? color.textPrimary : color.textSecondary}
            style={open && styles.chevronOpen}
          />
        </View>
      )}
    </Pressable>
  );
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
 * own heading, with `tag` beside its name.
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
                here && { backgroundColor: accent.subtle },
                (hovered || pressed) && {
                  backgroundColor: here ? accent.subtleHover : neutral.subtle,
                },
              ]}
            >
              {here ? <View style={[styles.dot, { backgroundColor: accent.solid }]} /> : null}
              <View style={styles.name}>
                <Text
                  role={nameRole(depth)}
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
const CHEVRON = 14;
const HIT_SLOP = { top: 4, bottom: 4, left: 8, right: 8 };
/** The chevron's column. */
const TOGGLE = 28;
const ROW_PAD = 8;
/** A row's name, by depth: the opening's heading, a variation, a sub-variation. */
const NAME_ROLE = ['headingLg', 'body', 'bodySm'] as const;
const nameRole = (depth: number) => NAME_ROLE[Math.min(depth, 2)];

const OPENING_GAP = narrowLength('opening-gap', 28);
/** Space below an open opening, its credits' last line, on every page. */
const AFTER_OPEN = 28;
const STYLES = narrowStyles((px) => ({
  openings: { gap: px(OPENING_GAP) },
  // The credits make up what a narrow page's gap leaves out, so an open opening stands apart.
  credits: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: px(OPENING_GAP.times(-1).plus(AFTER_OPEN)),
  },
}));

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: CONTENT_MAX, gap: 40, paddingTop: 12, paddingBottom: 48 },
  title: { fontFamily: fonts.display },
  side: { gap: 28 },
  sideHead: { borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 8 },
  opening: { gap: 6 },
  openingName: { fontFamily: fonts.display },
  nowText: { textTransform: 'uppercase', letterSpacing: 1.2 },
  rows: { gap: 2 },
  closed: { display: 'none' },
  // Below a side's last opening, the space between sides, or the page's end, follows instead.
  lastOfSideCredits: { paddingBottom: 0 },
  // Sub-variations hang from their parent's chevron on a thin rule.
  subRows: { marginLeft: TOGGLE / 2, paddingLeft: 6, borderLeftWidth: 1 },
  branch: { flexDirection: 'row', alignItems: 'flex-start' },
  // Rounded for its focus ring.
  toggle: { width: TOGGLE, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  toggleFace: {
    width: TOGGLE,
    height: TOGGLE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  chevronOpen: { transform: [{ rotate: '90deg' }] },
  link: { flex: 1, borderRadius: 8, outlineOffset: -2 },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    columnGap: 10,
    rowGap: 2,
    paddingHorizontal: 10,
    paddingVertical: ROW_PAD,
    borderRadius: 8,
  },
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
});
