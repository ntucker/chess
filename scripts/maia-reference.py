"""Writes src/maia/reference-moves.json, the moves the app's Maia engine is tested against.

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

The positions are 150 from lichess's openings list for each rating, then 12 per
rating from random games stopped where a pawn can promote, with the promotion
the network rates highest. Everything is seeded and downloaded at pinned
versions, so the output only changes when this script or the models change.
Rerun it after changing the models or adding positions or ratings, and review
the moves that changed.
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
PIECES = [chess.PAWN, chess.KNIGHT, chess.BISHOP, chess.ROOK, chess.QUEEN, chess.KING]


def download(url):
    with urllib.request.urlopen(url) as response:
        return response.read()


# lc0's move names in vocabulary order, and where each sits in the policy output.
_encoder = download(f'{LC0}/src/neural/encoder.cc').decode()
MOVES = re.findall(r'"([a-h][1-8][a-h][1-8][qrb]?)"', _encoder[_encoder.index('kMoveStrs'):])
assert len(MOVES) == 1858, len(MOVES)
VOCABULARY = {move: i for i, move in enumerate(MOVES)}
_policy_map = download(f'{LC0}/src/neural/tables/policy_map.h').decode()
_table = _policy_map[_policy_map.index('kConvPolicyMap[] = {') + 20:].split('};')[0]
CONV_POLICY_MAP = [int(v) for v in re.findall(r'-?\d+', _table)]
assert len(CONV_POLICY_MAP) == 73 * 64, len(CONV_POLICY_MAP)  # the first 73 of the 80 output planes


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
        elif wire == 1:
            value = struct.unpack_from('<d', data, at)[0]
            at += 8
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
    params = fields.get(3, [b''])[0]
    if not params:
        return np.zeros(0, np.float32)
    theta = np.frombuffer(params, dtype='<u2').astype(np.float32) / 65535.0
    low, high = fields.get(1, [0.0])[0], fields.get(2, [0.0])[0]
    return np.float32(low) * (1 - theta) + np.float32(high) * theta


def conv_block(fields):
    """A ConvBlock's weights [outputs, inputs, 3, 3] and biases, with batch norm folded in."""
    weights = layer(message(fields, 1))
    biases = layer(message(fields, 2))
    means = layer(message(fields, 3))
    variances = layer(message(fields, 4))
    gammas = layer(message(fields, 5))
    betas = layer(message(fields, 6))
    outputs = len(means) or len(biases)
    if not len(biases):
        biases = np.zeros(outputs, np.float32)
    weights = weights.reshape(outputs, -1)
    if len(means):
        if not len(gammas):
            gammas = np.ones(outputs, np.float32)
        if not len(betas):
            betas = np.zeros(outputs, np.float32)
        scale = gammas / np.sqrt(variances + 1e-5)
        weights = weights * scale[:, None]
        biases = -scale * (means - biases) + betas
    return weights.reshape(outputs, -1, 3, 3), biases


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


def forward(net, planes):
    """The policy head's 80 planes x 64 squares, flattened."""
    x = relu(conv3(planes, *net['input']))
    for conv1, conv2, w1, b1, w2, b2 in net['blocks']:
        y = conv3(relu(conv3(x, *conv1)), *conv2)
        channels = y.shape[0]
        hidden = relu(w1.reshape(-1, channels) @ y.reshape(channels, 64).mean(1) + b1)
        gates = w2.reshape(2 * channels, -1) @ hidden + b2
        gamma = 1 / (1 + np.exp(-gates[:channels]))
        x = relu(gamma[:, None, None] * y + gates[channels:, None, None] + x)
    p = conv3(relu(conv3(x, *net['policy1'])), *net['policy'])
    return p.reshape(-1)


def encode(board):
    """lc0's 112 input planes for a board whose move stack starts from the starting position."""
    planes = np.zeros((112, 64), np.float32)
    us = board.turn
    flip = (lambda s: s ^ 56) if us == chess.BLACK else (lambda s: s)
    history = [board.copy()]
    b = board.copy()
    while len(history) < 8 and b.move_stack:
        b.pop()
        history.append(b.copy())
    for i, h in enumerate(history):
        base = i * 13
        for k, piece in enumerate(PIECES):
            for s in h.pieces(piece, us):
                planes[base + k, flip(s)] = 1
            for s in h.pieces(piece, not us):
                planes[base + 6 + k, flip(s)] = 1
        if h.is_repetition(2):
            planes[base + 12] = 1
    if board.has_queenside_castling_rights(us):
        planes[104] = 1
    if board.has_kingside_castling_rights(us):
        planes[105] = 1
    if board.has_queenside_castling_rights(not us):
        planes[106] = 1
    if board.has_kingside_castling_rights(not us):
        planes[107] = 1
    if us == chess.BLACK:
        planes[108] = 1
    planes[109] = board.halfmove_clock
    planes[111] = 1
    return planes.reshape(112, 8, 8)


def lc0_uci(board, move):
    """UCI as lc0 writes it: castling as the king taking its rook (e1h1)."""
    uci = move.uci()
    if board.is_castling(move):
        uci = uci[:2] + ('h' if move.to_square % 8 == 6 else 'a') + uci[3]
    return uci


def scores(net, board):
    """Each legal move's score, by the move."""
    out = forward(net, encode(board))
    policy = np.full(1858, -np.inf, np.float32)
    for i, j in enumerate(CONV_POLICY_MAP):
        if j >= 0:
            policy[j] = out[i]
    result = {}
    for move in board.legal_moves:
        name = lc0_uci(board, move)
        if board.turn == chess.BLACK:
            name = name[0] + str(9 - int(name[1])) + name[2] + str(9 - int(name[3])) + name[4:]
        if name.endswith('n'):
            name = name[:4]
        result[move] = policy[VOCABULARY[name]]
    return result


def best(move_scores):
    return max(move_scores, key=move_scores.get)


def opening_positions():
    """150 positions from lichess's openings list, the same for every rating."""
    rows = []
    for name in 'abcde':
        tsv = download(f'{OPENINGS}/{name}.tsv').decode()
        rows += list(csv.DictReader(io.StringIO(tsv), delimiter='\t'))
    random.seed(1)
    random.shuffle(rows)
    boards = []
    for row in rows[:150]:
        board = chess.Board()
        for token in row['pgn'].split():
            if not token.endswith('.'):
                board.push_san(token)
        if not board.is_game_over():
            boards.append(board)
    return boards


def line(board):
    replay = chess.Board()
    moves = []
    for move in board.move_stack:
        moves.append(lc0_uci(replay, move))
        replay.push(move)
    return ' '.join(moves)


def promotion_positions(net, rating):
    """Positions from seeded random games where a pawn can promote: 6 with each side to move."""
    rng = random.Random(rating)
    found = {chess.WHITE: 0, chess.BLACK: 0}
    rows = []
    while min(found.values()) < 6:
        board = chess.Board()
        for _ in range(160):
            moves = list(board.legal_moves)
            if not moves:
                break
            promotions = [m for m in moves if m.promotion]
            if promotions:
                captures = [m for m in promotions if board.is_capture(m)]
                if found[board.turn] < 6 and (captures or found[board.turn] < 3):
                    move_scores = scores(net, board)
                    rows.append({
                        'rating': rating,
                        'line': ' '.join(m.uci() for m in board.move_stack),
                        'move': lc0_uci(board, best(move_scores)),
                        'bestPromotion': best({m: move_scores[m] for m in promotions}).uci(),
                    })
                    found[board.turn] += 1
                break
            pawn_moves = [m for m in moves if board.piece_type_at(m.from_square) == chess.PAWN]
            if pawn_moves and rng.random() < 0.7:
                board.push(rng.choice(pawn_moves))
            else:
                board.push(rng.choice(moves))
    return rows


def main():
    nets = {rating: load(rating) for rating in RATINGS}
    openings = opening_positions()
    rows = []
    for rating in RATINGS:
        for board in openings:
            move = best(scores(nets[rating], board))
            rows.append({'rating': rating, 'line': line(board), 'move': lc0_uci(board, move)})
    for rating in RATINGS:
        rows += promotion_positions(nets[rating], rating)
    sys.stdout.write('[\n' + ',\n'.join('  ' + json.dumps(row) for row in rows) + '\n]\n')


if __name__ == '__main__':
    main()
