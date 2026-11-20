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
 * on the book's main path. A chapter is titled by its name, under the first
 * named position below the root as its group ("Slav accepted: Alapin
 * variation"), the one level of grouping lessons have. On the main path every learner move is the book's main
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
    lines: tableLines(source),
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
      const subheading = /^===+\s*(.*?)\s*===+$/.exec(line.trim());
      if (subheading) section = plainText(subheading[1]);
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

/** The SAN moves of each `|lineN=` in the page's theory table, up to a placeholder like `...`. */
function tableLines(source: string): string[][] {
  return [...source.matchAll(/^\|\s*line\d+\s*=(.*)$/gm)].map(([, line]) => {
    const moves: string[] = [];
    for (const token of line
      .replace(/\d+\.(?:\.\.)?/g, ' ')
      .split(/\s+/)
      .filter(Boolean)) {
      if (/^\.+$/.test(token)) break;
      moves.push(token.replace(/[!?]+$/, ''));
    }
    return moves;
  });
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
}

export interface WikibooksOptions {
  /** The page to start from; its title names the moves from the start position. */
  readonly root: PageTitle;
  /** The side the lesson teaches: only its second choices leave the main path. */
  readonly learner: Color;
  /**
   * Names to replace, to match the other sources' ("Slav accepted": "Pure
   * Slav"); an empty one drops the name, so its position starts no chapter.
   */
  readonly rename?: Readonly<Record<string, string>>;
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

/** The book's pages under `root` as PGN, one game per chapter (see the file comment). */
export async function wikibooksPgn(
  fetchPage: FetchPage,
  options: WikibooksOptions,
): Promise<string> {
  const { root, learner, rename = {}, leave = [], maxPages = 400, log = console.log } = options;
  const path: string[] = [];
  let pos = Chess.default();
  for (const segment of root.split('/').slice(1)) {
    const san = segmentSan(segment);
    const after = san && played(pos, san);
    if (!after) throw new Error(`${root}: ${segment} is not a legal move`);
    path.push(san);
    pos = after;
  }
  const reader: Reader = { fetchPage, pagesLeft: maxPages, leave: new Set(leave), log };
  const top = await readTree(reader, root, path.at(-1)!, pos, []);
  const name = (node: BookNode) => (node.name && (rename[node.name] ?? node.name)) || undefined;
  return chapters(top, path.slice(0, -1), learner, name)
    .map((game) => makePgn(game))
    .join('\n');
}

interface Reader {
  readonly fetchPage: FetchPage;
  pagesLeft: number;
  readonly leave: ReadonlySet<string>;
  readonly log: (message: string) => void;
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
  for (const line of page.lines) addLine(node, line);
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

/** Adds the legal start of `line` below `node`, as moves without comments. */
function addLine(node: BookNode, line: readonly string[]) {
  let at = node;
  for (const san of line) {
    if (at.left) return;
    let child = at.children.find((c) => c.san === san);
    if (!child) {
      const after = played(at.pos, san);
      if (!after) return;
      child = { san, pos: after, comment: '', children: [] };
      at.children.push(child);
    }
    at = child;
  }
}

/** A chapter's top: the position it starts its own moves from, the moves to it, and its title. */
interface ChapterTop {
  readonly node: BookNode;
  readonly path: readonly BookNode[];
  readonly title: string;
}

/**
 * The tree cut into chapters at named positions on the main path; `prefix`
 * is the moves before `top`'s, which the root page's title names.
 */
function chapters(
  top: BookNode,
  prefix: readonly string[],
  learner: Color,
  name: (node: BookNode) => string | undefined,
): Game<PgnNodeData>[] {
  const tops: ChapterTop[] = [];
  const visit = (
    node: BookNode,
    path: readonly BookNode[],
    group: string | undefined,
    current: string | undefined,
    onMain: boolean,
  ) => {
    const own = name(node);
    if (node === top) tops.push({ node, path, title: '' });
    else if (onMain && !node.transposed && own && own !== current) {
      tops.push({ node, path, title: group ? `${group}: ${own}` : own });
      group ??= own;
      current = own;
    }
    const main = node.children.find((child) => !child.left && !child.transposed);
    node.children.forEach((child) => {
      const mainMove = child === main || node.pos.turn !== learner;
      visit(child, [...path, child], group, current, onMain && mainMove && !child.left);
    });
  };
  visit(top, [top], undefined, undefined, true);
  const isTop = new Set(tops.map(({ node }) => node));
  return tops.map(({ node, path, title }) => {
    const game: Game<PgnNodeData> = {
      headers: new Map([
        ['Event', title || 'Wikibooks'],
        ['ChapterName', title],
        ['Result', '*'],
      ]),
      moves: new Node(),
    };
    let at: Node<PgnNodeData> = game.moves;
    for (const san of prefix) at = append(at, san);
    path.slice(0, -1).forEach((above) => (at = append(at, above.san)));
    addSubtree(append(at, node.san, node.comment), node, (child) => isTop.has(child));
    return game;
  });
}

/** Adds `node`'s moves below `at`; a move into another chapter's top keeps its place but stops there. */
function addSubtree(at: Node<PgnNodeData>, node: BookNode, isTop: (node: BookNode) => boolean) {
  for (const child of node.children) {
    if (isTop(child)) append(at, child.san);
    else addSubtree(append(at, child.san, child.comment), child, isTop);
  }
}

function append(at: Node<PgnNodeData>, san: string, comment = ''): ChildNode<PgnNodeData> {
  const child = new ChildNode<PgnNodeData>({ san, ...(comment && { comments: [comment] }) });
  at.children.push(child);
  return child;
}
