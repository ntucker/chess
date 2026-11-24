/**
 * A piece's letter in a move's name (SAN): the N of Nf3 or Nbd7, the Q of
 * e8=Q. Words around moves never match ("Queen", "Bayonet"), since a piece's
 * letter starts a word and a square follows it.
 */
const PIECE_LETTER = /(^|[^A-Za-z])([KQRBN])(?=[a-h]?[1-8]?x?[a-h][1-8])|(=)([QRBN])/g;

/**
 * `text` cut around the piece letters of the moves it names, which are its
 * odd parts: "Good move. 23…Qb6" is ["Good move. 23…", "Q", "b6"].
 */
export function splitPieceLetters(text: string): string[] {
  const parts: string[] = [];
  let from = 0;
  for (const match of text.matchAll(PIECE_LETTER)) {
    const at = match.index + (match[1] ?? match[3]).length;
    parts.push(text.slice(from, at), text[at]);
    from = at + 1;
  }
  parts.push(text.slice(from));
  return parts;
}
