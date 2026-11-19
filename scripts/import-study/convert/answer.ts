/**
 * What the model answers for each comment: the lesson's ideas as the model
 * writes them, with moves in SAN rather than UCI (the converter replays them),
 * and `SCHEMA`, the JSON Schema its answer must match.
 */
import type { Color, SquareName } from 'chessops/types';

import {
  EVALUATIONS,
  IMBALANCE_KINDS,
  RELATIONS,
  type Evaluation,
  type ImbalanceKind,
  type Relation,
  type Route,
  type StructureFeature,
} from '@/lesson/lesson';

export interface Answer {
  readonly id: string;
  readonly notes: readonly AnswerNote[];
}

export interface AnswerNote {
  /** About the position after the commented move (its note) or before it (that position's note). */
  readonly about: 'move' | 'before';
  readonly text: string;
  readonly ideas: readonly AnswerIdea[];
}

export type AnswerIdea =
  | { readonly type: 'purpose'; readonly from: SquareName; readonly relation: Relation; readonly targets: SquareName[] }
  | {
      readonly type: 'pressure';
      readonly side: Color;
      readonly target: SquareName;
      readonly attackers: SquareName[];
      readonly defenders: SquareName[];
    }
  | { readonly type: 'plan'; readonly side: Color; readonly routes: Route[]; readonly goals?: SquareName[] }
  | { readonly type: 'threat'; readonly side: Color; readonly move: string; readonly answer?: string }
  | { readonly type: 'trap'; readonly moves: string[]; readonly verdict: Evaluation | 'losesMaterial' }
  | { readonly type: 'line'; readonly moves: string[]; readonly verdict: Evaluation }
  | { readonly type: 'structure'; readonly side: Color; readonly features: AnswerFeature[] }
  | { readonly type: 'imbalance'; readonly side: Color; readonly kind: ImbalanceKind }
  | { readonly type: 'evaluation'; readonly value: Evaluation };

/** A structure feature, with a pawn break's move in SAN. */
export type AnswerFeature =
  | Exclude<StructureFeature, { kind: 'pawnBreak' }>
  | { readonly kind: 'pawnBreak'; readonly move: string };

// ---------------------------------------------------------------- schema

const strings = (pattern?: string) => ({ type: 'array', items: { type: 'string', ...(pattern && { pattern }) } });
const squares = strings('^[a-h][1-8]$');
const files = strings('^[a-h]$');
const side = { enum: ['white', 'black'] };
const evaluation = { enum: EVALUATIONS };

/** An object schema whose properties are all required except `optional`. */
const object = (properties: Record<string, unknown>, optional: readonly string[] = []) => ({
  type: 'object',
  properties,
  required: Object.keys(properties).filter((key) => !optional.includes(key)),
  additionalProperties: false,
});
const kind = (name: string) => ({ const: name });

const feature = {
  anyOf: [
    object({ kind: { enum: ['isolatedPawn', 'backwardPawn', 'passedPawn', 'pawnChain', 'weakSquare', 'outpost'] }, squares }),
    object({ kind: { enum: ['doubledPawns', 'openFile', 'halfOpenFile', 'pawnMajority'] }, files }),
    object({ kind: kind('pawnBreak'), move: { type: 'string' } }),
  ],
};

const idea = {
  anyOf: [
    object({
      type: kind('purpose'),
      from: { type: 'string' },
      relation: { enum: RELATIONS },
      targets: squares,
    }),
    object({ type: kind('pressure'), side, target: { type: 'string' }, attackers: squares, defenders: squares }),
    object(
      {
        type: kind('plan'),
        side,
        routes: {
          type: 'array',
          items: object({ from: { type: 'string' }, to: { type: 'string' }, moves: { type: 'integer' } }, ['moves']),
        },
        goals: squares,
      },
      ['goals'],
    ),
    object({ type: kind('threat'), side, move: { type: 'string' }, answer: { type: 'string' } }, ['answer']),
    object({ type: kind('trap'), moves: strings(), verdict: { enum: [...evaluation.enum, 'losesMaterial'] } }),
    object({ type: kind('line'), moves: strings(), verdict: evaluation }),
    object({ type: kind('structure'), side, features: { type: 'array', items: feature } }),
    object({ type: kind('imbalance'), side, kind: { enum: IMBALANCE_KINDS } }),
    object({ type: kind('evaluation'), value: evaluation }),
  ],
};

export const SCHEMA = object({
  comments: {
    type: 'array',
    items: object({
      id: { type: 'string' },
      notes: {
        type: 'array',
        items: object({ about: { enum: ['move', 'before'] }, text: { type: 'string' }, ideas: { type: 'array', items: idea } }),
      },
    }),
  },
});

/** `value` if it has the shape of one comment's answer (the schema's details are checked idea by idea later). */
export function asAnswer(value: unknown): Answer | undefined {
  const answer = value as Answer | null;
  const ok =
    typeof answer?.id === 'string' &&
    Array.isArray(answer.notes) &&
    answer.notes.every(
      (note) =>
        (note?.about === 'move' || note?.about === 'before') && typeof note.text === 'string' && Array.isArray(note.ideas),
    );
  return ok ? answer : undefined;
}
