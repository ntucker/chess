/**
 * Wikibooks' "Chess Opening Theory" as study chapters, so the rest of the
 * importer reads it like a lichess study. The book has one page per position,
 * titled by the moves that reach it (`Chess_Opening_Theory/1._d4/1...d5`),
 * and each page links to the pages of the moves that follow. Its text is
 * CC BY-SA 4.0, so a lesson's sources must credit it with that license.
 *
 * A page's paragraphs become the comment on the move that reaches it, except
 * a paragraph about exactly one of the next moves, which joins that move's
 * comment so it shows when the learner looks at that move. The next moves
 * come in the page's `responses` order, else the order its text links them:
 * the first is the book's main move, skipping one that `leave` names or
 * whose page redirects (a transposition, read by its other move order, so a
 * leaf here). Lines in a page's theory table extend the tree past the pages,
 * moves only; they are often wrong, so each stops at its first illegal move.
 *
 * Pages are cut into chapters at named positions ("5. a4 · Alapin variation")
 * on the book's main path. A chapter is titled by its name under the named
 * positions above it on that path ("Slav accepted: Alapin variation: Dutch
 * variation"), each colon a narrower group. On the main path every learner move is the book's main
 * move, so a chapter never makes the importer recommend a move the book does
 * not lead with; a named position off it stays in its parent's chapter.
 */
import { Chess } from 'chessops/chess';
import { ChildNode, makePgn, Node, type Game, type PgnNodeData } from 'chessops/pgn';
import { parseSan } from 'chessops/san';
import type { Color } from 'chessops/types';

/** A page title, like `Chess_Opening_Theory/1._d4/1...d5`. */
export type PageTitle = string;

/** A page's wiki source, or undefined when the page does not exist. */
export type FetchPage = (title: PageTitle) => Promise<string | undefined>;

/** What one page says, read from its wiki source. */
export interface Page {
  /** The position's name from the page heading ("Alapin variation"), if it gives one. */
  readonly name?: string;
  /** The next moves the page names, in SAN, main move first. */
  readonly next: readonly string[];
  /** The page's own paragraphs, as plain text. */
  readonly text: readonly string[];
  /** Paragraphs about exactly one next move, by its SAN. */
  readonly about: ReadonlyMap<string, readonly string[]>;
  /** Theory table lines from this position, in SAN, each cut at its first placeholder. */
  readonly lines: readonly (readonly string[])[];
}

/** A link to a next move's page: `[[/5. a4/]]`, `[[/5...Bf5|label]]`. */
const CHILD_LINK = /\[\[\/(\d+\.(?:\.\.)?[ _]?[^/|\]]+)\/?(?:\|[^\]]*)?\]\]/g;

/** The SAN a move segment of a title or link names: `a4` for `5._a4` or `5. a4`. */
export function segmentSan(segment: string): string | undefined {
  return /^\d+\.(?:\.\.)?[ _]?(\S+)$/.exec(segment.trim())?.[1];
}

/** Reads `source`, the wiki text of one page. */
export function readPage(source: string): Page {
  const template = positionTemplate(source);
  const body = source
    .slice(source.indexOf(template) + template.length)
    .split(/^==\s*(?:Theory table|References)\s*==/im)[0];
  const heading = /^==([^=].*?)==\s*$/m.exec(body);
  const prose = heading ? body.slice(heading.index + heading[0].length) : body;
  const linked = (wiki: string) =>
    [...wiki.matchAll(CHILD_LINK)].flatMap(([, segment]) => segmentSan(segment) ?? []);

  const text: string[] = [];
  const about = new Map<string, string[]>();
  for (const paragraph of paragraphs(prose)) {
    const mentioned = unique(linked(paragraph.wiki));
    if (mentioned.length === 1)
      about.set(mentioned[0], [...(about.get(mentioned[0]) ?? []), paragraph.text]);
    else text.push(paragraph.text);
  }
  return {
    name: heading?.[1].split('·')[1]?.trim() || undefined,
    next: unique([...linked(template), ...linked(prose)]),
    text,
    about,
    lines: [...tableLines(source), ...htmlTableLines(source)],
  };
}

/** The page's `{{Chess Opening Theory/Position ...}}`, up to its own closing braces, or ''. */
function positionTemplate(source: string): string {
  const start = source.indexOf('{{Chess Opening Theory/Position');
  if (start < 0) return '';
  let depth = 0;
  for (const brace of source.slice(start).matchAll(/\{\{|\}\}/g)) {
    depth += brace[0] === '{{' ? 1 : -1;
    if (depth === 0) return source.slice(start, start + brace.index + 2);
  }
  return source.slice(start);
}

/**
 * The paragraphs of `prose`, split at blank lines and list items, with their
 * wiki source and plain text. A paragraph under a "Plans for White" heading
 * starts with it, since the heading says whose plans they are.
 */
function paragraphs(prose: string): { wiki: string; text: string }[] {
  let section = '';
  const result: { wiki: string; text: string }[] = [];
  for (const block of prose.split(/\n\s*\n|\n(?=[*#])/)) {
    const lines = block.split('\n').filter((line) => {
      // Any level: a page without the position template keeps its own "= Title =" in the prose.
      const subheading = /^(=+)\s*(.*?)\s*\1$/.exec(line.trim());
      if (subheading) section = plainText(subheading[2]);
      return !subheading;
    });
    const wiki = lines.join(' ');
    const text = plainText(wiki.replace(/^[*#:]+\s*/, ''));
    // A sentence at least: skips leftovers such as "White's main lines:".
    if (text.split(' ').length < 6) continue;
    result.push({ wiki, text: /^Plans for /i.test(section) ? `${section}: ${text}` : text });
  }
  return result;
}

/** Wiki markup as plain text: links as their label or move, without templates, references, tags or bold. */
export function plainText(wiki: string): string {
  return wiki
    .replace(/<ref[^>]*\/>|<ref[\s\S]*?<\/ref>/g, '')
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1')
    .replace(
      /\[\[([^\]]*)\]\]/g,
      (_, target: string) =>
        target
          .split('/')
          .filter((part) => part && part !== '..')
          .at(-1) ?? '',
    )
    .replace(/\[https?:\S+\s([^\]]*)\]/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/'{2,}/g, '')
    .replace(/_/g, ' ')
    .replace(/(\d+)(\.(?:\.\.)?)\s+(?=[KQRBNa-hO])/g, '$1$2')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The moves of each `|lineN=` in the page's theory table, in SAN with any
 * glyph (`dxc4?`). A `...` repeats the move above it in the same column
 * ("9. ... Bg6" under "9. Qe2 Nbd7" is 9.Qe2 Bg6); a line stops at one with
 * nothing above it.
 */
function tableLines(source: string): string[][] {
  const rows = [...source.matchAll(/^\|\s*line\d+\s*=(.*)$/gm)].map(([, line]) => {
    const row: Cell[] = [];
    let ply: number | undefined;
    for (const token of line
      .replace(/(\d+\.(?:\.\.)?)/g, ' $1 ')
      .split(/\s+/)
      .filter(Boolean)) {
      const number = /^(\d+)\.(\.\.)?$/.exec(token);
      if (number) ply = 2 * Number(number[1]) - (number[2] ? 0 : 1);
      else if (ply) row.push([ply++, token]);
      else break;
    }
    return row;
  });
  return repeatsResolved(rows);
}

/**
 * The rows of the page's theory table when it is written in HTML (the
 * Albin's) rather than as `|lineN=`: a header row numbers the moves, and
 * each cell holds that move's pair, White's and Black's split by `<br>`. A
 * `...` repeats the move above it, as in `tableLines`; a row stops at a cell
 * that is not a pair (the closing evaluation, "+=").
 */
function htmlTableLines(source: string): string[][] {
  const lines: string[][] = [];
  for (const [table] of source.matchAll(/<table[\s\S]*?<\/table>/gi)) {
    const rows = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(([, row]) => row);
    const first = Number(/<th[^>]*>\s*(\d+)\s*<\/th>/i.exec(table)?.[1]);
    if (!first) continue;
    const cellRows = rows
      .map((row) => [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(([, cell]) => cell))
      .filter((cells) => cells.length > 0);
    const moveRows = cellRows.map((cells) => {
      const moves: Cell[] = [];
      for (const [i, cell] of cells.entries()) {
        const pair = cell.split(/<br\s*\/?>/i);
        if (pair.length !== 2) break;
        // The table writes a promotion as fxg1(N), SAN as fxg1=N.
        const [white, black] = pair.map((half) => plainText(half).replace(/\((\w)\)/, '=$1'));
        moves.push([2 * (first + i) - 1, white], [2 * (first + i), black]);
      }
      return moves;
    });
    lines.push(...repeatsResolved(moveRows).filter((line) => line.length > 0));
  }
  return lines;
}

/** A move in a table row, with the ply it is played at. */
type Cell = readonly [ply: number, move: string];

/**
 * Each row's moves, given by ply, with a `...` taking the move at its ply in
 * the row above; a row stops at a `...` with nothing above it.
 */
function repeatsResolved(rows: readonly (readonly Cell[])[]): string[][] {
  let above = new Map<number, string>();
  return rows.map((row) => {
    const moves = new Map<number, string>();
    for (const [ply, token] of row) {
      const move = /^\.+$/.test(token) ? above.get(ply) : token;
      if (!move) break;
      moves.set(ply, move);
    }
    above = moves;
    return [...moves.values()];
  });
}

/** PGN's numbers for move glyphs (NAGs): `?` is 2, `?!` is 6. */
const GLYPHS: Readonly<Record<string, number>> = {
  '!': 1,
  '?': 2,
  '!!': 3,
  '??': 4,
  '!?': 5,
  '?!': 6,
};

/** A table move as its SAN and the glyph's NAG, if it has one. */
function glyphed(move: string): { san: string; nags: number[] } {
  const [, san, glyph] = /^(.*?)([!?]*)$/.exec(move)!;
  return { san, nags: glyph in GLYPHS ? [GLYPHS[glyph]] : [] };
}

const unique = <T>(items: readonly T[]) => [...new Set(items)];

/** A position of the book: the move that reaches it, what was said of it, and its next moves. */
interface BookNode {
  readonly san: string;
  readonly pos: Chess;
  /** The page's name for the position, if it has a page that gives one. */
  readonly name?: string;
  /** The comment on the move into this position. */
  readonly comment: string;
  readonly children: BookNode[];
  /** The position belongs to another lesson (see `WikibooksOptions.leave`). */
  readonly left?: boolean;
  /** The page redirects to the position's page by another move order, read there. */
  readonly transposed?: boolean;
  /** The glyph a theory table gives the move into this position (`?` is 2). */
  readonly nags?: readonly number[];
}

/** Whether `node` is read elsewhere: on another page, or in another lesson. */
const elsewhere = (node: BookNode) => !!(node.left || node.transposed);

export interface WikibooksOptions {
  /** The page to start from; its title names the moves from the start position. */
  readonly root: PageTitle;
  /** The side the lesson teaches: only its second choices leave the main path. */
  readonly learner: Color;
  /**
   * Names to replace, to match the other sources' ("Slav accepted": "Pure
   * Slav"); an empty one drops the name, so its position starts no chapter.
   * Keys are the page's own spelling; every name is then title-cased.
   */
  readonly rename?: Readonly<Record<string, string>>;
  /**
   * The variation the root page's own chapter names, and the group of every
   * chapter below it ("Semi-Slav" for a page reaching it by another move
   * order); without one, the root page's chapter is untitled.
   */
  readonly topName?: string;
  /**
   * Names of positions that belong to another lesson ("Semi-Slav Defense"):
   * the move into one stays, with what its parent page says of it, but
   * nothing below it, and it is never the main move.
   */
  readonly leave?: readonly string[];
  /** At most this many pages are read. */
  readonly maxPages?: number;
  readonly log?: (message: string) => void;
}

const MINOR_WORDS = new Set('a an and at by de der for in of on or the to van von with'.split(' '));

/**
 * `name` in title case, as the lichess guides write theirs: "Dutch variation"
 * becomes "Dutch Variation". Minor words after the first stay lower case, and
 * moves ("4.e3", "exd5") are left as they are.
 */
export function titleCase(name: string): string {
  return name.replace(
    /(?<![\p{L}\p{N}_'.])\p{Ll}[\p{L}']*(?![\p{L}\p{N}])/gu,
    (word, at: number) =>
      at > 0 && MINOR_WORDS.has(word) ? word : word[0].toUpperCase() + word.slice(1),
  );
}

/** The moves of the line a root page stands for, in SAN; throws on a segment that names none. */
export function rootSans(root: string): string[] {
  return root
    .split('/')
    .slice(1)
    .map((segment) => {
      const san = segmentSan(segment);
      if (!san) throw new Error(`${root}: ${segment} is not a move`);
      return san;
    });
}

/** The book's pages under `root` as PGN, one game per chapter (see the file comment). */
export async function wikibooksPgn(
  fetchPage: FetchPage,
  options: WikibooksOptions,
): Promise<string> {
  const {
    root,
    learner,
    rename = {},
    topName,
    leave = [],
    maxPages = 400,
    log = console.log,
  } = options;
  const path: string[] = [];
  let pos = Chess.default();
  for (const san of rootSans(root)) {
    const after = played(pos, san);
    if (!after) throw new Error(`${root}: ${san} is not a legal move`);
    path.push(san);
    pos = after;
  }
  const reader: Reader = {
    fetchPage,
    pagesLeft: maxPages,
    leave: new Set(leave),
    log,
    lines: 0,
    linesCut: 0,
  };
  const top = await readTree(reader, root, path.at(-1)!, pos, []);
  const pages = maxPages - Math.max(reader.pagesLeft, 0);
  log(
    `wikibooks ${root}: ${pages} pages read; ${reader.linesCut} of ${reader.lines} table lines cut short (another page's position, another lesson's, or an illegal move)`,
  );
  // A missing root page would otherwise import as one bare move. One with text
  // but no next moves (the Fischer Defense's) still explains the move into it.
  if (top.children.length === 0 && !top.comment)
    throw new Error(`${root}: Wikibooks has nothing here`);
  const name = (node: BookNode) =>
    (node.name && titleCase(rename[node.name] ?? node.name)) || undefined;
  return chapters(top, path.slice(0, -1), learner, name, topName)
    .map((game) => makePgn(game))
    .join('\n');
}

interface Reader {
  readonly fetchPage: FetchPage;
  pagesLeft: number;
  readonly leave: ReadonlySet<string>;
  readonly log: (message: string) => void;
  /** Theory table lines read, and how many stopped before their end. */
  lines: number;
  linesCut: number;
}

/** A page that only sends the reader to another: `#REDIRECT [[Chess Opening Theory/...]]`. */
const REDIRECT = /^#redirect\s*\[\[([^\]]+)\]\]/i;

/** The page's source within the page budget; past it, says so once and reads nothing. */
function readSource(reader: Reader, title: PageTitle): Promise<string | undefined> {
  if (reader.pagesLeft-- > 0) return reader.fetchPage(title);
  if (reader.pagesLeft === -1)
    reader.log(`wikibooks: page budget spent, the tree stops at ${title}`);
  return Promise.resolve(undefined);
}

async function readTree(
  reader: Reader,
  title: PageTitle,
  san: string,
  pos: Chess,
  intro: readonly string[],
): Promise<BookNode> {
  const source = await readSource(reader, title);
  const leaf = (name: string | undefined, transposed: boolean): BookNode => {
    const left = name !== undefined && reader.leave.has(name);
    return { san, pos, name, comment: intro.join('\n\n'), children: [], left, transposed };
  };
  const redirect = source && REDIRECT.exec(source.trim())?.[1];
  if (redirect) {
    // The position by another move order, whose page is read there: a leaf
    // here, named like it so that `leave` applies.
    const target = await readSource(reader, redirect.replaceAll(' ', '_'));
    return leaf(target && !REDIRECT.test(target.trim()) ? readPage(target).name : undefined, true);
  }
  const page = source === undefined ? undefined : readPage(source);
  if (page?.name && reader.leave.has(page.name)) return leaf(page.name, false);
  const comment = [...intro, ...(page?.text ?? [])].join('\n\n');
  const node: BookNode = { san, pos, name: page?.name, comment, children: [] };
  if (!page) return node;
  for (const next of page.next) {
    const after = played(pos, next);
    if (!after) {
      // Its paragraphs go with it: the page names it in error.
      reader.log(`wikibooks: ${title} names ${next}, not legal there`);
      continue;
    }
    const segment = `${pos.fullmoves}${pos.turn === 'white' ? '._' : '...'}${next}`;
    node.children.push(
      await readTree(reader, `${title}/${segment}`, next, after, page.about.get(next) ?? []),
    );
  }
  for (const line of page.lines) {
    reader.lines++;
    if (!addLine(node, line)) reader.linesCut++;
  }
  return node;
}

/** `pos` after `san`, or undefined when it is not legal there. */
function played(pos: Chess, san: string): Chess | undefined {
  const move = parseSan(pos, san);
  if (!move) return undefined;
  const after = pos.clone();
  after.play(move);
  return after;
}

/** Adds the legal start of `line` below `node`, as moves without comments; whether all of it was. */
function addLine(node: BookNode, line: readonly string[]): boolean {
  let at = node;
  for (const move of line) {
    if (elsewhere(at)) return false;
    const { san, nags } = glyphed(move);
    let child = at.children.find((c) => c.san === san);
    if (!child) {
      const after = played(at.pos, san);
      if (!after) return false;
      child = { san, pos: after, comment: '', children: [], nags };
      at.children.push(child);
    }
    at = child;
  }
  return true;
}

/** A chapter's top: the position it starts its own moves from, the moves to it, and its title. */
interface ChapterTop {
  readonly node: BookNode;
  readonly path: readonly BookNode[];
  readonly title: string;
}

/**
 * The tree cut into chapters at named positions on the main path; `prefix`
 * is the moves before `top`'s, which the root page's title names, and
 * `topName` titles `top`'s chapter and groups the rest.
 */
function chapters(
  top: BookNode,
  prefix: readonly string[],
  learner: Color,
  name: (node: BookNode) => string | undefined,
  topName?: string,
): Game<PgnNodeData>[] {
  const tops: ChapterTop[] = [];
  /** `groups`: the names of the chapters above, the nearest last. */
  const visit = (
    node: BookNode,
    path: readonly BookNode[],
    groups: readonly string[],
    onMain: boolean,
  ) => {
    const own = name(node);
    if (node === top) tops.push({ node, path, title: topName ?? '' });
    else if (onMain && !node.transposed && own && own !== groups.at(-1)) {
      groups = [...groups, own];
      tops.push({ node, path, title: groups.join(': ') });
    }
    const main = node.children.find((child) => !elsewhere(child));
    node.children.forEach((child) => {
      const mainMove = child === main || node.pos.turn !== learner;
      visit(child, [...path, child], groups, onMain && mainMove && !child.left);
    });
  };
  visit(top, [top], topName ? [topName] : [], true);
  const isTop = new Set(tops.map(({ node }) => node));
  return tops.map(({ node, path, title }) => {
    const game: Game<PgnNodeData> = {
      headers: new Map([
        ['Event', title || 'Wikibooks'],
        ['ChapterName', title],
        // Its own moves start at its named position (`Chapter.namedFrom`).
        ['NamedFrom', String(prefix.length + path.length)],
        ['Result', '*'],
      ]),
      moves: new Node(),
    };
    let at: Node<PgnNodeData> = game.moves;
    for (const san of prefix) at = append(at, san);
    path.slice(0, -1).forEach((above) => (at = append(at, above.san, '', above.nags)));
    addSubtree(append(at, node.san, node.comment, node.nags), node, (child) => isTop.has(child));
    return game;
  });
}

/**
 * Adds `node`'s moves below `at`, a move read elsewhere last so that it is
 * never the main move; a move into another chapter's top keeps its place but
 * stops there.
 */
function addSubtree(at: Node<PgnNodeData>, node: BookNode, isTop: (node: BookNode) => boolean) {
  const children = [...node.children].sort((a, b) => Number(elsewhere(a)) - Number(elsewhere(b)));
  for (const child of children) {
    if (isTop(child)) append(at, child.san, '', child.nags);
    else addSubtree(append(at, child.san, child.comment, child.nags), child, isTop);
  }
}

function append(
  at: Node<PgnNodeData>,
  san: string,
  comment = '',
  nags: readonly number[] = [],
): ChildNode<PgnNodeData> {
  const child = new ChildNode<PgnNodeData>({
    san,
    ...(comment && { comments: [comment] }),
    ...(nags.length > 0 && { nags: [...nags] }),
  });
  at.children.push(child);
  return child;
}
