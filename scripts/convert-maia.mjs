// Downloads Maia's models and converts them for the app's engine:
//
//   yarn maia
//
// Maia (https://github.com/CSSLab/maia-chess) is a set of Leela Chess Zero
// networks, one per rating from 1100 to 1900, trained to predict the moves
// people of that rating play. Each comes as an lc0 weights file: a gzipped
// protobuf. This script keeps only what picking a move needs (the residual
// tower and the policy head, not the value head), folds each batch norm into
// the convolution before it, and writes assets/maia/maia-<rating>.bin in the
// format src/maia/network.ts reads:
//
//   "MAIA", then uint16 version, blocks, channels, SE channels, then tensors in
//   the order network.ts lists them, each as float32 min, float32 max, uint32
//   count and `count` uint16 values v standing for min + (max - min) * v / 65535.
//
// All numbers are little-endian. The models are GPL-3.0 licensed; their
// license is copied next to them.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const SOURCE = 'https://raw.githubusercontent.com/CSSLab/maia-chess/master';
const RATINGS = [1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900];
const outDir = fileURLToPath(new URL('../assets/maia/', import.meta.url));

/** The fields of a protobuf message, by number, each a list of raw values. */
function readMessage(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fields = new Map();
  let at = 0;
  const varint = () => {
    let value = 0;
    let shift = 0;
    let byte;
    do {
      byte = bytes[at++];
      value += (byte & 0x7f) * 2 ** shift;
      shift += 7;
    } while (byte & 0x80);
    return value;
  };
  while (at < bytes.length) {
    const key = varint();
    const field = Math.floor(key / 8);
    let value;
    switch (key & 7) {
      case 0:
        value = varint();
        break;
      case 1:
        value = view.getFloat64(at, true);
        at += 8;
        break;
      case 2: {
        const length = varint();
        value = bytes.subarray(at, at + length);
        at += length;
        break;
      }
      case 5:
        value = view.getFloat32(at, true);
        at += 4;
        break;
      default:
        throw new Error(`Unsupported protobuf wire type ${key & 7}`);
    }
    if (!fields.has(field)) fields.set(field, []);
    fields.get(field).push(value);
  }
  return fields;
}

const one = (fields, n) => fields.get(n)?.[0];
const message = (fields, n) => readMessage(one(fields, n) ?? new Uint8Array());

/** A Weights.Layer, decoded from LINEAR16 (lc0's only encoding for Maia). */
function layer(fields) {
  const params = one(fields, 3);
  if (!params) return new Float32Array();
  const encoding = one(fields, 4) ?? 1;
  if (encoding !== 1) throw new Error(`Unsupported layer encoding ${encoding}`);
  const min = one(fields, 1) ?? 0;
  const max = one(fields, 2) ?? 0;
  const view = new DataView(params.buffer, params.byteOffset, params.byteLength);
  const values = new Float32Array(params.byteLength / 2);
  for (let i = 0; i < values.length; i++) {
    const theta = view.getUint16(i * 2, true) / 0xffff;
    values[i] = min * (1 - theta) + max * theta;
  }
  return values;
}

/** A ConvBlock's weights and biases, with its batch norm folded in. */
function convBlock(fields) {
  const weights = layer(message(fields, 1));
  let biases = layer(message(fields, 2));
  const means = layer(message(fields, 3));
  const variances = layer(message(fields, 4)); // lc0 calls these "stddivs"
  const gammas = layer(message(fields, 5));
  const betas = layer(message(fields, 6));
  const outputs = means.length || biases.length;
  if (biases.length === 0) biases = new Float32Array(outputs);
  if (means.length === 0) return [weights, biases];

  const perOutput = weights.length / outputs;
  const folded = new Float32Array(outputs);
  for (let o = 0; o < outputs; o++) {
    const scale = (gammas.length ? gammas[o] : 1) / Math.sqrt(variances[o] + 1e-5);
    for (let i = 0; i < perOutput; i++) weights[o * perOutput + i] *= scale;
    folded[o] = -scale * (means[o] - biases[o]) + (betas.length ? betas[o] : 0);
  }
  return [weights, folded];
}

function convert(gzipped) {
  const net = readMessage(gunzipSync(gzipped));
  const weights = message(net, 10);
  const residual = weights.get(2) ?? [];
  const [inputWeights, inputBiases] = convBlock(message(weights, 1));
  const channels = inputBiases.length;
  const tensors = [inputWeights, inputBiases];
  let seChannels = 0;
  for (const block of residual.map(readMessage)) {
    const se = message(block, 3);
    const b1 = layer(message(se, 2));
    seChannels = b1.length;
    tensors.push(
      ...convBlock(message(block, 1)),
      ...convBlock(message(block, 2)),
      layer(message(se, 1)),
      b1,
      layer(message(se, 3)),
      layer(message(se, 4)),
    );
  }
  tensors.push(...convBlock(message(weights, 11)), ...convBlock(message(weights, 3)));

  const size = 12 + tensors.reduce((sum, t) => sum + 12 + t.length * 2, 0);
  const out = new DataView(new ArrayBuffer(size));
  let at = 0;
  for (const c of 'MAIA') out.setUint8(at++, c.charCodeAt(0));
  for (const n of [1, residual.length, channels, seChannels]) {
    out.setUint16(at, n, true);
    at += 2;
  }
  for (const tensor of tensors) {
    let min = Infinity;
    let max = -Infinity;
    for (const v of tensor) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (min === max) max = min + 1;
    out.setFloat32(at, min, true);
    out.setFloat32(at + 4, max, true);
    out.setUint32(at + 8, tensor.length, true);
    at += 12;
    for (const v of tensor) {
      out.setUint16(at, Math.round(((v - min) / (max - min)) * 0xffff), true);
      at += 2;
    }
  }
  return new Uint8Array(out.buffer);
}

async function download(path) {
  const response = await fetch(`${SOURCE}/${path}`);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

mkdirSync(outDir, { recursive: true });
writeFileSync(`${outDir}LICENSE`, await download('LICENSE'));
for (const rating of RATINGS) {
  const bin = convert(await download(`maia_weights/maia-${rating}.pb.gz`));
  writeFileSync(`${outDir}maia-${rating}.bin`, bin);
  console.log(`assets/maia/maia-${rating}.bin (${(bin.length / 1e6).toFixed(2)} MB)`);
}
