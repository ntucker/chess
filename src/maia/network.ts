'worklet';

/**
 * Maia's neural network: the residual tower, convolutional policy head and
 * win/draw/loss value head of a Leela Chess Zero network, run in plain
 * TypeScript so it works the same on the web, on phones and in tests. Weights
 * come from the files that scripts/convert-maia.mjs writes, with batch norm
 * already folded in.
 *
 * Activations are kept per channel on a 10x10 grid: the 8x8 board with a
 * border of zeros, so a 3x3 convolution needs no edge checks.
 *
 * The 'worklet' directive above lets the Android app run these functions on
 * a background thread (see engine.ts). It keeps this file free of
 * imports: a worklet can only call other worklets. Worklets are created in
 * order, so each function must come after the ones it calls.
 */
export const INPUT_PLANES = 112;
const POLICY_PLANES = 80;
const PADDED = 100;

/** A convolution's or dense layer's weights and biases. */
interface Layer {
  /** [outputs][inputs][3][3] for a 3x3 convolution, [outputs][inputs] otherwise. */
  readonly weights: Float32Array;
  readonly biases: Float32Array; // [outputs]
}

interface ResidualBlock {
  readonly conv1: Layer;
  readonly conv2: Layer;
  readonly se: {
    readonly w1: Float32Array; // [seChannels][channels]
    readonly b1: Float32Array;
    readonly w2: Float32Array; // [2 * channels][seChannels]
    readonly b2: Float32Array;
  };
}

/** Planes of 64 squares to padded planes of 100. */
function pad(planes: Float32Array, count: number): Float32Array {
  const out = new Float32Array(count * PADDED);
  for (let p = 0; p < count; p++) {
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        out[p * PADDED + (y + 1) * 10 + x + 1] = planes[p * 64 + y * 8 + x];
      }
    }
  }
  return out;
}

function unpad(planes: Float32Array, count: number): Float32Array {
  const out = new Float32Array(count * 64);
  for (let p = 0; p < count; p++) {
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        out[p * 64 + y * 8 + x] = planes[p * PADDED + (y + 1) * 10 + x + 1];
      }
    }
  }
  return out;
}

/**
 * A 3x3 convolution with zero padding, from padded planes to padded planes.
 * It works out one output row at a time with its 8 sums, 3 weights and 10
 * inputs in local variables, which runs about 5 times faster than looping
 * over each square, with or without a JIT.
 */
function convolve(input: Float32Array, inputs: number, conv: Layer, relu: boolean): Float32Array {
  const outputs = conv.biases.length;
  const out = new Float32Array(outputs * PADDED);
  const w = conv.weights;
  for (let o = 0; o < outputs; o++) {
    const bias = conv.biases[o];
    for (let y = 0; y < 8; y++) {
      let a0 = bias, a1 = bias, a2 = bias, a3 = bias, a4 = bias, a5 = bias, a6 = bias, a7 = bias;
      for (let i = 0; i < inputs; i++) {
        let k = (o * inputs + i) * 9;
        // The kernel's three rows read the padded rows y, y + 1 and y + 2.
        for (let r = i * PADDED + y * 10, end = r + 30; r < end; r += 10, k += 3) {
          const w0 = w[k], w1 = w[k + 1], w2 = w[k + 2];
          const p0 = input[r], p1 = input[r + 1], p2 = input[r + 2], p3 = input[r + 3];
          const p4 = input[r + 4], p5 = input[r + 5], p6 = input[r + 6], p7 = input[r + 7];
          const p8 = input[r + 8], p9 = input[r + 9];
          a0 += w0 * p0 + w1 * p1 + w2 * p2;
          a1 += w0 * p1 + w1 * p2 + w2 * p3;
          a2 += w0 * p2 + w1 * p3 + w2 * p4;
          a3 += w0 * p3 + w1 * p4 + w2 * p5;
          a4 += w0 * p4 + w1 * p5 + w2 * p6;
          a5 += w0 * p5 + w1 * p6 + w2 * p7;
          a6 += w0 * p6 + w1 * p7 + w2 * p8;
          a7 += w0 * p7 + w1 * p8 + w2 * p9;
        }
      }
      const at = o * PADDED + (y + 1) * 10 + 1;
      out[at] = relu && a0 < 0 ? 0 : a0;
      out[at + 1] = relu && a1 < 0 ? 0 : a1;
      out[at + 2] = relu && a2 < 0 ? 0 : a2;
      out[at + 3] = relu && a3 < 0 ? 0 : a3;
      out[at + 4] = relu && a4 < 0 ? 0 : a4;
      out[at + 5] = relu && a5 < 0 ? 0 : a5;
      out[at + 6] = relu && a6 < 0 ? 0 : a6;
      out[at + 7] = relu && a7 < 0 ? 0 : a7;
    }
  }
  return out;
}

function dense(input: Float32Array, weights: Float32Array, biases: Float32Array, relu: boolean) {
  const out = new Float32Array(biases.length);
  for (let o = 0; o < out.length; o++) {
    let v = biases[o];
    for (let i = 0; i < input.length; i++) v += weights[o * input.length + i] * input[i];
    out[o] = relu && v < 0 ? 0 : v;
  }
  return out;
}

/**
 * The end of a residual block: scales and shifts each channel of `z` by
 * amounts computed from the channel averages, adds the block's input back,
 * and applies ReLU.
 */
function squeezeExcite(
  z: Float32Array,
  residual: Float32Array,
  channels: number,
  se: ResidualBlock['se'],
): Float32Array {
  const pooled = new Float32Array(channels);
  for (let c = 0; c < channels; c++) {
    let sum = 0;
    for (let y = 1; y <= 8; y++) {
      for (let x = 1; x <= 8; x++) sum += z[c * PADDED + y * 10 + x];
    }
    pooled[c] = sum / 64;
  }
  const hidden = dense(pooled, se.w1, se.b1, true);
  const gates = dense(hidden, se.w2, se.b2, false);

  const out = new Float32Array(channels * PADDED);
  for (let c = 0; c < channels; c++) {
    const gamma = 1 / (1 + Math.exp(-gates[c]));
    const beta = gates[channels + c];
    for (let y = 1; y <= 8; y++) {
      for (let x = 1; x <= 8; x++) {
        const i = c * PADDED + y * 10 + x;
        const v = gamma * z[i] + beta + residual[i];
        out[i] = v > 0 ? v : 0;
      }
    }
  }
  return out;
}

/**
 * A 1x1 convolution with ReLU, from padded planes to unpadded planes: each
 * output square is a weighted sum of the input channels on that square.
 */
function pointwise(input: Float32Array, inputs: number, conv: Layer): Float32Array {
  const outputs = conv.biases.length;
  const out = new Float32Array(outputs * 64);
  for (let o = 0; o < outputs; o++) {
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        let v = conv.biases[o];
        for (let i = 0; i < inputs; i++) {
          v += conv.weights[o * inputs + i] * input[i * PADDED + (y + 1) * 10 + x + 1];
        }
        out[o * 64 + y * 8 + x] = v > 0 ? v : 0;
      }
    }
  }
  return out;
}

function softmax(logits: Float32Array): Float32Array {
  const max = Math.max(...logits);
  const out = logits.map((v) => Math.exp(v - max));
  const sum = out.reduce((a, b) => a + b, 0);
  return out.map((v) => v / sum);
}

/** The value head: a 1x1 convolution, then two dense layers. */
interface ValueHead {
  readonly conv: Layer;
  readonly hidden: Layer;
  readonly out: Layer;
}

/** How likely the side to move is to win, draw and lose, from the tower's output `x`. */
function winDrawLoss(x: Float32Array, channels: number, head: ValueHead): Float32Array {
  const { conv, hidden, out } = head;
  const h = dense(pointwise(x, channels, conv), hidden.weights, hidden.biases, true);
  return softmax(dense(h, out.weights, out.biases, false));
}

/** A network's weights, as `parseNetwork` reads them. */
export interface MaiaNetwork {
  readonly input: Layer;
  readonly blocks: readonly ResidualBlock[];
  readonly policy1: Layer;
  readonly policy: Layer;
  /** Only the networks that judge positions have one (see scripts/convert-maia.mjs). */
  readonly value?: ValueHead;
}

/** Reads a network from a .bin file's bytes. */
export function parseNetwork(bytes: ArrayBuffer | Uint8Array): MaiaNetwork {
  const view =
    bytes instanceof Uint8Array
      ? new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      : new DataView(bytes);
  const magic = String.fromCharCode(
    view.getUint8(0),
    view.getUint8(1),
    view.getUint8(2),
    view.getUint8(3),
  );
  // Version 2 adds the value head.
  const version = view.getUint16(4, true);
  if (magic !== 'MAIA' || (version !== 1 && version !== 2)) {
    throw new Error('Not a Maia network file');
  }
  const blockCount = view.getUint16(6, true);
  let at = 12;
  const tensor = () => {
    const min = view.getFloat32(at, true);
    const max = view.getFloat32(at + 4, true);
    const values = new Float32Array(view.getUint32(at + 8, true));
    at += 12;
    const step = (max - min) / 0xffff;
    for (let i = 0; i < values.length; i++, at += 2) {
      values[i] = min + view.getUint16(at, true) * step;
    }
    return values;
  };
  const layer = () => ({ weights: tensor(), biases: tensor() });

  const input = layer();
  const blocks: ResidualBlock[] = [];
  for (let i = 0; i < blockCount; i++) {
    const conv1 = layer();
    const conv2 = layer();
    blocks.push({ conv1, conv2, se: { w1: tensor(), b1: tensor(), w2: tensor(), b2: tensor() } });
  }
  const policy1 = layer();
  const policy = layer();
  const value = version === 2 ? { conv: layer(), hidden: layer(), out: layer() } : undefined;
  return { input, blocks, policy1, policy, value };
}

/** What the network makes of a position (see `forward`). */
export interface NetworkOutput {
  /** A score for every kind of move from every square (80 planes x 64 squares; see `policySlot`). */
  readonly policy: Float32Array;
  /**
   * How likely the side to move is to win, draw and lose, adding up to 1;
   * absent for a network without a value head.
   */
  readonly wdl?: Float32Array;
}

/** Runs the network on input planes from `prepareInput`. */
export function forward(network: MaiaNetwork, planes: Float32Array): NetworkOutput {
  const c = network.input.biases.length;
  let x = convolve(pad(planes, INPUT_PLANES), INPUT_PLANES, network.input, true);
  for (const block of network.blocks) {
    const y = convolve(x, c, block.conv1, true);
    const z = convolve(y, c, block.conv2, false);
    x = squeezeExcite(z, x, c, block.se);
  }
  const p = convolve(x, c, network.policy1, true);
  const policy = unpad(convolve(p, c, network.policy, false), POLICY_PLANES);
  const wdl = network.value && winDrawLoss(x, c, network.value);
  return { policy, wdl };
}
