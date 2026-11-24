import { SAN } from './replay';

/** A move (`SAN`) in a sentence: never inside a word, though a move number may lead it (`9.Ne1`, `23…Qb6`). */
const MOVE_IN_TEXT = new RegExp(String.raw`(?<![A-Za-z])${SAN}(?![\w-])`, 'g');

/**
 * `text` cut around the piece letters of the moves it names, which are its
 * odd parts: "Good move. 23…Qb6" is ["Good move. 23…", "Q", "b6"]. A piece
 * letter leads a piece's move (the N of Nbd7) or follows a promotion's `=`.
 */
export function splitPieceLetters(text: string): string[] {
  const parts: string[] = [];
  let from = 0;
  for (const { 0: san, index } of text.matchAll(MOVE_IN_TEXT)) {
    // A move holds at most one: castling and pawn moves have none.
    const piece = san.search(/[KQRBN]/);
    if (piece < 0) continue;
    const at = index + piece;
    parts.push(text.slice(from, at), text[at]);
    from = at + 1;
  }
  parts.push(text.slice(from));
  return parts;
}
