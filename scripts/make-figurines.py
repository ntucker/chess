"""Writes assets/fonts/Figurines.ttf, the font that draws a move's piece letters as pieces.

    python3 -m venv .venv-figurines
    .venv-figurines/bin/pip install -r scripts/make-figurines.requirements.txt
    .venv-figurines/bin/python -I scripts/make-figurines.py

Its only glyphs are K, Q, R, B and N, each the board's own cburnett piece
(chessground's black set, read from its CSS in node_modules) in one color:
the black parts are the glyph, and the light inner lines are cut out of it,
drawn thicker than on the board so they stay open at text sizes. Text in the
font takes the color of the words around it.

Each piece is as wide as its art, so a piece is wider than DM Mono's letters;
the script prints the widest's advance, which FIGURINE_ADVANCE in
src/theme/theme.ts must match. The font's ascent and descent sit inside the
app's text fonts', so a piece never makes a line taller.

The pieces are by Colin M.L. Burnett, GPLv2+ (as lichess lists them), like
src/components/PieceGlyph.tsx; so is this font.
"""

import base64
import re
import xml.etree.ElementTree as ET
from pathlib import Path as FilePath

import pathops
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.svgLib.path import parse_path

ROOT = FilePath(__file__).resolve().parent.parent
CSS = ROOT / 'node_modules/@lichess-org/chessground/assets/chessground.cburnett.css'
OUT = ROOT / 'assets/fonts/Figurines.ttf'

FAMILY = 'Opening Night Figurines'
LETTERS = {'K': 'king', 'Q': 'queen', 'R': 'rook', 'B': 'bishop', 'N': 'knight'}

UNITS_PER_EM = 1000
# Every piece is drawn at one scale, so they keep the board's sizes relative to
# each other, a little taller than a capital (the king 785 units, crown to
# foot), since a piece fills less of its height than a letter.
SCALE = 22.5
# The pieces' feet (y 39.5 in the 45-unit art, with its outline) on the baseline.
BASELINE = 40.2
# Space on either side of a piece, about a letter's.
SIDE_BEARING = 45
# Inside DM Mono's (992, -310), Instrument Sans's (970, -250) and DM Serif Display's.
ASCENT = 900
DESCENT = -250
# The light lines' widths on the board, multiplied so they stay open at text sizes.
LIGHT_LINE_GROWTH = 1.9

SVG = '{http://www.w3.org/2000/svg}'
INHERITED = ('fill', 'fill-rule', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin')
CAPS = {'butt': pathops.LineCap.BUTT_CAP, 'round': pathops.LineCap.ROUND_CAP}
JOINS = {'miter': pathops.LineJoin.MITER_JOIN, 'round': pathops.LineJoin.ROUND_JOIN}


def black_pieces():
    """Each black piece's SVG, from chessground's cburnett CSS."""
    css = CSS.read_text()
    pattern = r"piece\.(\w+)\.black \{\s*background-image: url\('data:image/svg\+xml;base64,([^']+)'"
    return {role: base64.b64decode(data).decode() for role, data in re.findall(pattern, css)}


def shapes(element, style=None):
    """Each path and circle under `element`, in painting order, with the style it inherits."""
    style = {'fill': '#000', 'stroke': 'none', 'stroke-width': '1', **(style or {})}
    style.update({key: element.get(key) for key in INHERITED if element.get(key) is not None})
    tag = element.tag.removeprefix(SVG)
    if tag in ('path', 'circle'):
        yield element, style
    for child in element:
        yield from shapes(child, style)


def outline(element):
    """The element's geometry as a path, before it is filled or stroked."""
    path = pathops.Path()
    pen = path.getPen()
    if element.tag.removeprefix(SVG) == 'circle':
        cx, cy, r = (float(element.get(key)) for key in ('cx', 'cy', 'r'))
        # A circle as two arcs, which the SVG parser turns into curves.
        parse_path(f'M{cx - r} {cy}a{r} {r} 0 1 0 {2 * r} 0a{r} {r} 0 1 0 {-2 * r} 0z', pen)
    else:
        parse_path(element.get('d'), pen)
    return path


def painted(element, style, paint):
    """The area the element paints in `paint` (dark or light), filled and stroked."""
    is_paint = lambda color: color not in (None, 'none') and (color == '#000') == (paint == 'dark')
    area = pathops.Path()
    if is_paint(style['fill']):
        filled = outline(element)
        if style.get('fill-rule') == 'evenodd':
            filled.fillType = pathops.FillType.EVEN_ODD
        filled.simplify()
        area = pathops.op(area, filled, pathops.PathOp.UNION)
    if is_paint(style['stroke']):
        width = float(style['stroke-width'])
        if paint == 'light':
            width *= LIGHT_LINE_GROWTH
        stroked = outline(element)
        stroked.stroke(
            width,
            CAPS[style.get('stroke-linecap') or 'butt'],
            JOINS[style.get('stroke-linejoin') or 'miter'],
            4,
        )
        # Round caps and joins come out as conics, which a font can't hold.
        stroked.convertConicsToQuads()
        stroked.simplify()
        area = pathops.op(area, stroked, pathops.PathOp.UNION)
    return area


def silhouette(svg):
    """The piece in one color: every dark area painted, less the light ones painted over it."""
    glyph = pathops.Path()
    for element, style in shapes(ET.fromstring(svg)):
        glyph = pathops.op(glyph, painted(element, style, 'dark'), pathops.PathOp.UNION)
        glyph = pathops.op(glyph, painted(element, style, 'light'), pathops.PathOp.DIFFERENCE)
    return glyph


def glyph(path):
    """The piece as a TrueType glyph standing on the baseline, and its advance."""
    left, _, right, _ = path.bounds
    pen = TTGlyphPen(None)
    # Flip the art's downward y and scale it to font units, a side bearing in.
    transform = (SCALE, 0, 0, -SCALE, SIDE_BEARING - left * SCALE, BASELINE * SCALE)
    path.draw(TransformPen(Cu2QuPen(pen, max_err=1, reverse_direction=True), transform))
    return pen.glyph(), round((right - left) * SCALE + 2 * SIDE_BEARING)


def main():
    pieces = black_pieces()
    glyphs = {'.notdef': TTGlyphPen(None).glyph(), 'space': TTGlyphPen(None).glyph()}
    advances = {'.notdef': 500, 'space': 250}
    for letter, role in LETTERS.items():
        glyphs[letter], advances[letter] = glyph(silhouette(pieces[role]))

    builder = FontBuilder(UNITS_PER_EM, isTTF=True)
    builder.setupGlyphOrder(list(glyphs))
    builder.setupCharacterMap({0x20: 'space', **{ord(letter): letter for letter in LETTERS}})
    builder.setupGlyf(glyphs)
    metrics = {}
    for name, g in glyphs.items():
        g.recalcBounds(builder.font['glyf'])
        metrics[name] = (advances[name], getattr(g, 'xMin', 0))
    builder.setupHorizontalMetrics(metrics)
    builder.setupHorizontalHeader(ascent=ASCENT, descent=DESCENT)
    builder.setupNameTable(
        {
            'familyName': FAMILY,
            'styleName': 'Regular',
            'copyright': 'Pieces by Colin M.L. Burnett (cburnett), GPLv2+',
            'licenseDescription': 'GNU General Public License, version 2 or later',
        }
    )
    builder.setupOS2(
        sTypoAscender=ASCENT,
        sTypoDescender=DESCENT,
        sTypoLineGap=0,
        usWinAscent=ASCENT,
        usWinDescent=-DESCENT,
        sCapHeight=700,
        sxHeight=500,
        fsType=0,
    )
    builder.setupPost()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    builder.save(OUT)
    widest = max(advances[letter] for letter in LETTERS) / UNITS_PER_EM
    print(f'Wrote {OUT.relative_to(ROOT)}; widest piece {widest} em (FIGURINE_ADVANCE)')


if __name__ == '__main__':
    main()
