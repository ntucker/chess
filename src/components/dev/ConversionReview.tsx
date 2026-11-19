import { AsyncBoundary, useSuspense } from '@data-client/react';
import { Button, Inline, Spinner, Stack, Text } from '@reactive/silk-native';
import { makeFen } from 'chessops/fen';
import { useState } from 'react';
import { View } from 'react-native';

import Board from '@/components/Board';
import { BrowserOnly } from '@/components/BrowserOnly';
import { Eyebrow } from '@/components/Eyebrow';
import type { Color } from '@/game/replay';
import { ideaDrawings } from '@/lesson/drawings';
import type { Idea } from '@/lesson/lesson';
import { getLesson, type LessonId } from '@/resources/lesson';

import { DevPage, devStyles, FramedBoard } from './DevPage';
import { reviewItems, type ReviewItem, type ReviewKind } from './review';

const PAGE = 12;
const KINDS: readonly { readonly kind: ReviewKind | 'all'; readonly label: string }[] = [
  { kind: 'all', label: 'All' },
  { kind: 'drawn', label: 'Drawn' },
  { kind: 'badge', label: 'Badge only' },
  { kind: 'text', label: 'Text only' },
];
const TYPES: readonly (Idea['type'] | 'any')[] = [
  'any',
  'purpose',
  'pressure',
  'plan',
  'threat',
  'trap',
  'line',
  'structure',
  'imbalance',
];

/**
 * Every note of a lesson beside the study's words it was made from, with the
 * board drawing its ideas: for judging an import, AI conversion included, by
 * eye. The app doesn't link here.
 */
export function ConversionReview({ id }: { readonly id: LessonId }) {
  return (
    <DevPage
      title="Conversion review"
      intro="Each note of the lesson beside the study comment it was written from. The board draws the note's ideas in the position they are about."
    >
      <BrowserOnly fallback={<Spinner />}>
        <AsyncBoundary fallback={<Spinner />} errorComponent={({ error }) => <Text role="body">{error.message}</Text>}>
          <Review id={id} />
        </AsyncBoundary>
      </BrowserOnly>
    </DevPage>
  );
}

function Review({ id }: { readonly id: LessonId }) {
  const lesson = useSuspense(getLesson, id);
  const items = reviewItems(lesson);
  const [kind, setKind] = useState<ReviewKind | 'all'>('all');
  const [type, setType] = useState<Idea['type'] | 'any'>('any');
  const [page, setPage] = useState(0);
  const shown = items.filter(
    (item) =>
      (kind === 'all' || item.kind === kind) &&
      (type === 'any' || item.note.ideas?.some((idea) => idea.type === type)),
  );
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const at = Math.min(page, pages - 1);
  const choose = (change: () => void) => {
    change();
    setPage(0);
  };
  return (
    <Stack gap="5">
      <Stack gap="3">
        <Inline gap="2" wrap="wrap">
          {KINDS.map((option) => (
            <Button
              key={option.kind}
              size="sm"
              variant={kind === option.kind ? 'solid' : 'soft'}
              onPress={() => choose(() => setKind(option.kind))}
            >
              {`${option.label} (${option.kind === 'all' ? items.length : items.filter((item) => item.kind === option.kind).length})`}
            </Button>
          ))}
        </Inline>
        <Inline gap="2" wrap="wrap">
          {TYPES.map((option) => (
            <Button
              key={option}
              size="sm"
              variant={type === option ? 'solid' : 'ghost'}
              onPress={() => choose(() => setType(option))}
            >
              {option === 'any' ? 'Any idea' : option}
            </Button>
          ))}
        </Inline>
        <Pager at={at} pages={pages} count={shown.length} onPage={setPage} />
      </Stack>
      <View style={devStyles.grid}>
        {shown.slice(at * PAGE, (at + 1) * PAGE).map((item) => (
          <ReviewCard key={item.key} item={item} learner={lesson.side} />
        ))}
      </View>
      <Pager at={at} pages={pages} count={shown.length} onPage={setPage} />
    </Stack>
  );
}

function Pager({
  at,
  pages,
  count,
  onPage,
}: {
  readonly at: number;
  readonly pages: number;
  readonly count: number;
  readonly onPage: (page: number) => void;
}) {
  return (
    <Inline gap="3" align="center">
      <Button size="sm" variant="soft" disabled={at === 0} onPress={() => onPage(at - 1)}>
        Previous
      </Button>
      <Text role="bodySm" tone="secondary">
        {`Page ${at + 1} of ${pages} · ${count} notes`}
      </Text>
      <Button size="sm" variant="soft" disabled={at >= pages - 1} onPress={() => onPage(at + 1)}>
        Next
      </Button>
    </Inline>
  );
}

function ReviewCard({ item, learner }: { readonly item: ReviewItem; readonly learner: Color }) {
  const { note, position, move } = item;
  const ideas = note.ideas ?? [];
  const drawings = ideas.flatMap((idea) => ideaDrawings(idea, position, learner));
  return (
    <Stack gap="3" style={devStyles.card}>
      <Stack gap="1">
        <Eyebrow>{item.variation}</Eyebrow>
        <Text role="caption" tone="secondary" style={devStyles.mono}>
          {item.line || 'Start'}
        </Text>
      </Stack>
      <Stack gap="1">
        <Eyebrow>Study</Eyebrow>
        <Text role="bodySm" tone="secondary">
          {note.original ?? note.text}
        </Text>
      </Stack>
      <Stack gap="1">
        <Eyebrow>Lesson</Eyebrow>
        <Text role="body">{note.text}</Text>
        <Text role="caption" tone="secondary" style={devStyles.mono}>
          {ideas.map((idea) => (idea.type === 'evaluation' ? `evaluation: ${idea.value}` : idea.type)).join(' · ') ||
            'text only'}
        </Text>
      </Stack>
      <FramedBoard>
        <Board
          fen={makeFen(position.toSetup())}
          orientation={learner}
          turnColor={position.turn}
          dests={{}}
          lastMove={move ? [move.slice(0, 2), move.slice(2, 4)] : undefined}
          check={position.isCheck()}
          drawings={drawings}
          onMove={() => {}}
          dom={{ style: devStyles.fill, scrollEnabled: false }}
        />
      </FramedBoard>
    </Stack>
  );
}
