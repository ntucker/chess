"""Writes src/maia/reference-moves.json, the moves and values the app's Maia engine is tested against.

    python3 -m venv .venv-maia
    .venv-maia/bin/pip install -r scripts/maia-reference.requirements.txt
    .venv-maia/bin/python -I scripts/maia-reference.py > src/maia/reference-moves.json

This is a second implementation of Maia, separate from the app's (src/maia), so
the tests compare two pieces of code rather than one with itself. It shares
nothing with the app:

- It reads lc0's original weights (maia_weights/maia-<rating>.pb.gz), not the
  app's converted .bin files, and folds batch norm itself in float32 with NumPy.
  The app's files store each weight again as 16 bits, which moves scores by
  about 1e-5. So a test failure where the two best moves score almost the same
  can come from a change to scripts/convert-maia.mjs; anything else is a bug.
- It encodes positions with python-chess, and finds each move's score with
  lc0's own move list and policy map (src/neural/encoder.cc and
  src/neural/tables/policy_map.h at lc0 v0.32.0), downloaded when it runs.

Everything is seeded and downloaded at pinned versions, so the output only
changes when this script or the models change. AGENTS.md says when to rerun it.
"""

import csv
import gzip
import io
import json
import random
import re
import struct
import sys
import urllib.request

import chess
import numpy as np

MAIA = 'https://raw.githubusercontent.com/CSSLab/maia-chess/master/maia_weights'
LC0 = 'https://raw.githubusercontent.com/LeelaChessZero/lc0/b38ed00a25baed9554d2675ec376bd50dad18195'
OPENINGS = 'https://raw.githubusercontent.com/lichess-org/chess-openings/3ba6b20d31b2e6125cb0e6a2e792f400717d9d39'
RATINGS = [1100, 1900]
# The ratings whose networks the app ships with a value head (VALUE_RATINGS in scripts/convert-maia.mjs).
VALUE_RATINGS = [1900]
PROMOTIONS_PER_SIDE = 6


def download(url):
    with urllib.request.urlopen(url) as response:
        return response.read()


def policy_slots():
    """Where each lc0 move name's score sits in the flattened policy output."""
    encoder = download(f'{LC0}/src/neural/encoder.cc').decode()
    moves = re.findall(r'"([a-h][1-8][a-h][1-8][qrb]?)"', encoder[encoder.index('kMoveStrs'):])
    assert len(moves) == 1858, len(moves)
    policy_map = download(f'{LC0}/src/neural/tables/policy_map.h').decode()
    table = policy_map.split('kConvPolicyMap[] = {')[1].split('};')[0]
    # One entry for each square of the first 73 of the policy's 80 planes: a move's index, or -1.
    move_indexes = [int(v) for v in re.findall(r'-?\d+', table)]
    assert len(move_indexes) == 73 * 64, len(move_indexes)
    return {moves[move]: slot for slot, move in enumerate(move_indexes) if move >= 0}


def read_message(data):
    """A protobuf message's fields, by number, each a list of raw values."""
    fields = {}
    at = 0

    def varint():
        nonlocal at
        value = shift = 0
        while True:
            byte = data[at]
            at += 1
            value |= (byte & 0x7F) << shift
            shift += 7
            if not byte & 0x80:
                return value

    while at < len(data):
        key = varint()
        wire = key & 7
        if wire == 0:
            value = varint()
        elif wire == 2:
            length = varint()
            value = data[at:at + length]
            at += length
        elif wire == 5:
            value = struct.unpack_from('<f', data, at)[0]
            at += 4
        else:
            raise ValueError(f'Unsupported protobuf wire type {wire}')
        fields.setdefault(key >> 3, []).append(value)
    return fields


def message(fields, n):
    return read_message(fields.get(n, [b''])[0])


def layer(fields):
    """A Weights.Layer, decoded from LINEAR16."""
    theta = np.frombuffer(fields.get(3, [b''])[0], dtype='<u2').astype(np.float32) / 65535.0
    low, high = fields.get(1, [0.0])[0], fields.get(2, [0.0])[0]
    return np.float32(low) * (1 - theta) + np.float32(high) * theta


def conv_block(fields, kernel=3):
    """A ConvBlock's weights [outputs, inputs, kernel, kernel] and biases, with batch norm folded in.

    Maia's last policy convolution has biases and no batch norm; every other
    convolution has batch norm and no biases.
    """
    weights, biases, means = (layer(message(fields, n)) for n in (1, 2, 3))
    if not len(means):
        return weights.reshape(len(biases), -1, kernel, kernel), biases
    assert not len(biases), 'a convolution with both biases and batch norm'
    variances, gammas, betas = (layer(message(fields, n)) for n in (4, 5, 6))
    scale = gammas / np.sqrt(variances + 1e-5)
    weights = weights.reshape(len(means), -1) * scale[:, None]
    return weights.reshape(len(means), -1, kernel, kernel), betas - scale * means


def dense_layer(fields, weights_field, outputs):
    """A fully connected layer's weights [outputs, inputs] and biases, from Weights fields."""
    return layer(message(fields, weights_field)).reshape(outputs, -1), layer(message(fields, weights_field + 1))


def load(rating):
    net = read_message(gzip.decompress(download(f'{MAIA}/maia-{rating}.pb.gz')))
    weights = message(net, 10)
    blocks = []
    for block in map(read_message, weights.get(2, [])):
        se = message(block, 3)
        blocks.append((
            conv_block(message(block, 1)),
            conv_block(message(block, 2)),
            *(layer(message(se, n)) for n in (1, 2, 3, 4)),
        ))
    return {
        'input': conv_block(message(weights, 1)),
        'blocks': blocks,
        'policy1': conv_block(message(weights, 11)),
        'policy': conv_block(message(weights, 3)),
        'value': conv_block(message(weights, 6), kernel=1),
        'value1': dense_layer(weights, 7, 128),
        'value2': dense_layer(weights, 9, 3),
    }


def conv3(x, weights, biases):
    """A 3x3 convolution with zero padding: x is [inputs, 8, 8]."""
    padded = np.zeros((x.shape[0], 10, 10), np.float32)
    padded[:, 1:9, 1:9] = x
    out = np.zeros((weights.shape[0], 8, 8), np.float32)
    for dy in range(3):
        for dx in range(3):
            patch = padded[:, dy:dy + 8, dx:dx + 8].reshape(x.shape[0], 64)
            out += (weights[:, :, dy, dx] @ patch).reshape(-1, 8, 8)
    return out + biases[:, None, None]


def relu(v):
    return np.maximum(v, 0)


def squeeze_excite(y, w1, b1, w2, b2):
    """y with each channel scaled and shifted by gates computed from every channel's mean."""
    channels = y.shape[0]
    hidden = relu(w1.reshape(-1, channels) @ y.reshape(channels, 64).mean(1) + b1)
    gates = w2.reshape(2 * channels, -1) @ hidden + b2
    gamma = 1 / (1 + np.exp(-gates[:channels]))
    return gamma[:, None, None] * y + gates[channels:, None, None]


def forward(net, planes):
    """The policy head's 80 planes x 64 squares, flattened, and the value head's win, draw and loss chances."""
    x = relu(conv3(planes, *net['input']))
    for conv1, conv2, *se in net['blocks']:
        y = conv3(relu(conv3(x, *conv1)), *conv2)
        x = relu(squeeze_excite(y, *se) + x)
    p = conv3(relu(conv3(x, *net['policy1'])), *net['policy'])
    (conv_w, conv_b), (w1, b1), (w2, b2) = net['value'], net['value1'], net['value2']
    v = relu(conv_w[:, :, 0, 0] @ x.reshape(x.shape[0], 64) + conv_b[:, None])
    hidden = relu(w1 @ v.reshape(-1) + b1)
    logits = w2 @ hidden + b2
    wdl = np.exp(logits - logits.max())
    return p.reshape(-1), wdl / wdl.sum()


def encode(board):
    """lc0's 112 input planes for a board whose move stack starts from the starting position."""
    planes = np.zeros((112, 64), np.float32)
    us = board.turn
    flip = chess.square_mirror if us == chess.BLACK else (lambda s: s)
    history = [board.copy()]
    b = board.copy()
    while len(history) < 8 and b.move_stack:
        b.pop()
        history.append(b.copy())
    for i, h in enumerate(history):
        base = i * 13
        for offset, color in ((0, us), (6, not us)):
            for k, piece in enumerate(chess.PIECE_TYPES):
                for s in h.pieces(piece, color):
                    planes[base + offset + k, flip(s)] = 1
        if h.is_repetition(2):
            planes[base + 12] = 1
    for plane, color in ((104, us), (106, not us)):
        planes[plane] = board.has_queenside_castling_rights(color)
        planes[plane + 1] = board.has_kingside_castling_rights(color)
    planes[108] = us == chess.BLACK
    planes[109] = board.halfmove_clock
    planes[111] = 1
    return planes.reshape(112, 8, 8)


def lc0_uci(board, move):
    """UCI as lc0 writes it: castling as the king taking its rook (e1h1)."""
    return board.uci(move, chess960=True)


def lc0_name(board, move):
    """The move's name in lc0's vocabulary.

    That is lc0's UCI seen from the side to move, with knight promotions as plain moves.
    """
    name = lc0_uci(board, move)
    if board.turn == chess.BLACK:
        name = name.translate(str.maketrans('12345678', '87654321'))
    return name.removesuffix('n')


def evaluate(net, slots, board):
    """Each legal move's score, by the move, and the side to move's win, draw and loss chances, rounded."""
    policy, wdl = forward(net, encode(board))
    move_scores = {move: policy[slots[lc0_name(board, move)]] for move in board.legal_moves}
    return move_scores, [round(float(v), 4) for v in wdl]


def best(move_scores):
    return max(move_scores, key=move_scores.get)


def opening_positions():
    """150 positions from lichess's openings list, the same for every rating."""
    rows = []
    for name in 'abcde':
        tsv = download(f'{OPENINGS}/{name}.tsv').decode()
        rows += list(csv.DictReader(io.StringIO(tsv), delimiter='\t'))
    random.Random(1).shuffle(rows)
    boards = []
    for row in rows[:150]:
        board = chess.Board()
        for token in row['pgn'].split():
            if not token.endswith('.'):
                board.push_san(token)
        boards.append(board)
    return boards


def line(board):
    """The moves played, as the app records them: castling as the king's two-square move (e1g1)."""
    return ' '.join(move.uci() for move in board.move_stack)


def first_promotion(rng):
    """A random game, mostly pawn moves, played until a pawn can promote.

    Returns that board, or None if no pawn could promote within 160 moves.
    """
    board = chess.Board()
    for _ in range(160):
        moves = list(board.legal_moves)
        if not moves:
            return None
        if any(move.promotion for move in moves):
            return board
        pawn_moves = [m for m in moves if board.piece_type_at(m.from_square) == chess.PAWN]
        if pawn_moves and rng.random() < 0.7:
            board.push(rng.choice(pawn_moves))
        else:
            board.push(rng.choice(moves))
    return None


def reference_row(rating, board, move_scores, wdl, **extra):
    """A row of the output: the move Maia plays, `extra`, and the value head's chances where the app ships it."""
    row = {'rating': rating, 'line': line(board), 'move': lc0_uci(board, best(move_scores)), **extra}
    if rating in VALUE_RATINGS:
        row['wdl'] = wdl
    return row


def promotion_positions(net, slots, rating):
    """Positions from seeded random games where a pawn can promote, PROMOTIONS_PER_SIDE with each side to move.

    After the first half for a side, only positions where a pawn can promote by
    capturing count, so both kinds of promotion are tested.
    """
    rng = random.Random(rating)
    found = {chess.WHITE: 0, chess.BLACK: 0}
    rows = []
    while min(found.values()) < PROMOTIONS_PER_SIDE:
        board = first_promotion(rng)
        if board is None or found[board.turn] == PROMOTIONS_PER_SIDE:
            continue
        promotions = [m for m in board.legal_moves if m.promotion]
        if found[board.turn] >= PROMOTIONS_PER_SIDE // 2 and not any(map(board.is_capture, promotions)):
            continue
        move_scores, wdl = evaluate(net, slots, board)
        best_promotion = best({m: move_scores[m] for m in promotions}).uci()
        rows.append(reference_row(rating, board, move_scores, wdl, bestPromotion=best_promotion))
        found[board.turn] += 1
    return rows


def main():
    slots = policy_slots()
    nets = {rating: load(rating) for rating in RATINGS}
    openings = opening_positions()
    rows = []
    for rating in RATINGS:
        for board in openings:
            rows.append(reference_row(rating, board, *evaluate(nets[rating], slots, board)))
    for rating in RATINGS:
        rows += promotion_positions(nets[rating], slots, rating)
    sys.stdout.write('[\n' + ',\n'.join('  ' + json.dumps(row) for row in rows) + '\n]\n')


if __name__ == '__main__':
    main()
