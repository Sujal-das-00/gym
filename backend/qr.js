"use strict";

// Dependency-free QR Code generator (byte mode).
// Supports versions 1-10 with a configurable error-correction level.
// Produces a real, scannable symbol so check-in works fully offline,
// without relying on any external QR image service.

// --- Galois field GF(256) for Reed-Solomon -------------------------------
const EXP = new Array(512);
const LOG = new Array(256);
(function initGalois() {
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];
})();

function gmul(a, b) {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

function rsGenPoly(degree) {
  let gen = [1];
  for (let i = 0; i < degree; i += 1) {
    const mult = [1, EXP[i]];
    const res = new Array(gen.length + 1).fill(0);
    for (let a = 0; a < gen.length; a += 1) {
      for (let b = 0; b < mult.length; b += 1) {
        res[a + b] ^= gmul(gen[a], mult[b]);
      }
    }
    gen = res;
  }
  return gen;
}

function rsEncode(data, ecLen) {
  const gen = rsGenPoly(ecLen);
  const res = new Array(ecLen).fill(0);
  for (const value of data) {
    const factor = value ^ res[0];
    res.shift();
    res.push(0);
    for (let j = 0; j < ecLen; j += 1) {
      res[j] ^= gmul(gen[j + 1], factor);
    }
  }
  return res;
}

// --- Capacity tables (versions 1-10) -------------------------------------
// [ecCodewordsPerBlock, group1Blocks, group1DataCodewords, group2Blocks, group2DataCodewords]
const EC_BLOCKS = {
  L: {
    1: [7, 1, 19, 0, 0],
    2: [10, 1, 34, 0, 0],
    3: [15, 1, 55, 0, 0],
    4: [20, 1, 80, 0, 0],
    5: [26, 1, 108, 0, 0],
    6: [18, 2, 68, 0, 0],
    7: [20, 2, 78, 0, 0],
    8: [24, 2, 97, 0, 0],
    9: [30, 2, 116, 0, 0],
    10: [18, 2, 68, 2, 69],
  },
  M: {
    1: [10, 1, 16, 0, 0],
    2: [16, 1, 28, 0, 0],
    3: [26, 1, 44, 0, 0],
    4: [18, 2, 32, 0, 0],
    5: [24, 2, 43, 0, 0],
    6: [16, 4, 27, 0, 0],
    7: [18, 4, 31, 0, 0],
    8: [22, 2, 38, 2, 39],
    9: [22, 3, 36, 2, 37],
    10: [26, 4, 43, 1, 44],
  },
};

const ALIGN_POS = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
};

const EC_FORMAT_BITS = { L: 0b01, M: 0b00, Q: 0b11, H: 0b10 };

function dataCodewords(version, level) {
  const [, g1b, g1c, g2b, g2c] = EC_BLOCKS[level][version];
  return g1b * g1c + g2b * g2c;
}

function pickVersion(byteLength, level) {
  for (let version = 1; version <= 10; version += 1) {
    const charCountBits = version <= 9 ? 8 : 16;
    const headerBits = 4 + charCountBits;
    const capacityBits = dataCodewords(version, level) * 8;
    if (headerBits + byteLength * 8 <= capacityBits) return version;
  }
  throw new Error("Data too large for supported QR versions (max 10).");
}

// --- Bit buffer ----------------------------------------------------------
class BitBuffer {
  constructor() {
    this.bits = [];
  }
  put(value, length) {
    for (let i = length - 1; i >= 0; i -= 1) {
      this.bits.push((value >>> i) & 1);
    }
  }
  get length() {
    return this.bits.length;
  }
}

function buildDataCodewords(text, version, level) {
  const bytes = Buffer.from(text, "utf8");
  const buffer = new BitBuffer();
  buffer.put(0b0100, 4); // byte mode
  buffer.put(bytes.length, version <= 9 ? 8 : 16);
  for (const byte of bytes) buffer.put(byte, 8);

  const totalData = dataCodewords(version, level);
  const capacityBits = totalData * 8;

  // Terminator (up to 4 zero bits).
  const remaining = capacityBits - buffer.length;
  buffer.put(0, Math.min(4, Math.max(0, remaining)));

  // Pad to a byte boundary.
  while (buffer.length % 8 !== 0) buffer.bits.push(0);

  const codewords = [];
  for (let i = 0; i < buffer.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j += 1) byte = (byte << 1) | buffer.bits[i + j];
    codewords.push(byte);
  }

  // Pad codewords.
  const padBytes = [0xec, 0x11];
  let padIndex = 0;
  while (codewords.length < totalData) {
    codewords.push(padBytes[padIndex % 2]);
    padIndex += 1;
  }
  return codewords;
}

function interleave(codewords, version, level) {
  const [ecPerBlock, g1Blocks, g1Count, g2Blocks, g2Count] = EC_BLOCKS[level][version];
  const blocks = [];
  let offset = 0;
  for (let i = 0; i < g1Blocks; i += 1) {
    const data = codewords.slice(offset, offset + g1Count);
    offset += g1Count;
    blocks.push({ data, ec: rsEncode(data, ecPerBlock) });
  }
  for (let i = 0; i < g2Blocks; i += 1) {
    const data = codewords.slice(offset, offset + g2Count);
    offset += g2Count;
    blocks.push({ data, ec: rsEncode(data, ecPerBlock) });
  }

  const result = [];
  const maxData = Math.max(...blocks.map((b) => b.data.length));
  for (let i = 0; i < maxData; i += 1) {
    for (const block of blocks) {
      if (i < block.data.length) result.push(block.data[i]);
    }
  }
  for (let i = 0; i < ecPerBlock; i += 1) {
    for (const block of blocks) result.push(block.ec[i]);
  }
  return result;
}

// --- Matrix construction -------------------------------------------------
function createMatrix(size) {
  const modules = Array.from({ length: size }, () => new Array(size).fill(null));
  const reserved = Array.from({ length: size }, () => new Array(size).fill(false));
  return { modules, reserved, size };
}

function placeFinder(m, row, col) {
  for (let r = -1; r <= 7; r += 1) {
    for (let c = -1; c <= 7; c += 1) {
      const rr = row + r;
      const cc = col + c;
      if (rr < 0 || rr >= m.size || cc < 0 || cc >= m.size) continue;
      const isBorder = r === -1 || r === 7 || c === -1 || c === 7;
      const inRing = r === 0 || r === 6 || c === 0 || c === 6;
      const inCenter = r >= 2 && r <= 4 && c >= 2 && c <= 4;
      m.modules[rr][cc] = isBorder ? 0 : inRing || inCenter ? 1 : 0;
      m.reserved[rr][cc] = true;
    }
  }
}

function placeAlignment(m, version) {
  const positions = ALIGN_POS[version];
  for (const r of positions) {
    for (const c of positions) {
      // Skip the three corners occupied by finder patterns.
      if ((r === 6 && c === 6) || (r === 6 && c === m.size - 7) || (r === m.size - 7 && c === 6)) continue;
      for (let dr = -2; dr <= 2; dr += 1) {
        for (let dc = -2; dc <= 2; dc += 1) {
          const rr = r + dr;
          const cc = c + dc;
          const ring = Math.max(Math.abs(dr), Math.abs(dc));
          m.modules[rr][cc] = ring === 1 ? 0 : 1;
          m.reserved[rr][cc] = true;
        }
      }
    }
  }
}

function placeTiming(m) {
  for (let i = 8; i < m.size - 8; i += 1) {
    const bit = i % 2 === 0 ? 1 : 0;
    if (!m.reserved[6][i]) {
      m.modules[6][i] = bit;
      m.reserved[6][i] = true;
    }
    if (!m.reserved[i][6]) {
      m.modules[i][6] = bit;
      m.reserved[i][6] = true;
    }
  }
}

function reserveFormatAreas(m, version) {
  const size = m.size;
  for (let i = 0; i < 9; i += 1) {
    if (!m.reserved[8][i]) m.reserved[8][i] = true;
    if (!m.reserved[i][8]) m.reserved[i][8] = true;
  }
  for (let i = 0; i < 8; i += 1) {
    m.reserved[8][size - 1 - i] = true;
    m.reserved[size - 1 - i][8] = true;
  }
  // Dark module.
  m.modules[size - 8][8] = 1;
  m.reserved[size - 8][8] = true;

  if (version >= 7) {
    for (let i = 0; i < 6; i += 1) {
      for (let j = 0; j < 3; j += 1) {
        m.reserved[i][size - 11 + j] = true;
        m.reserved[size - 11 + j][i] = true;
      }
    }
  }
}

function placeData(m, codewords) {
  const size = m.size;
  const bits = [];
  for (const cw of codewords) {
    for (let i = 7; i >= 0; i -= 1) bits.push((cw >>> i) & 1);
  }
  let bitIndex = 0;
  let upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col -= 1; // skip vertical timing column
    for (let i = 0; i < size; i += 1) {
      const row = upward ? size - 1 - i : i;
      for (let c = 0; c < 2; c += 1) {
        const cc = col - c;
        if (m.reserved[row][cc]) continue;
        m.modules[row][cc] = bitIndex < bits.length ? bits[bitIndex] : 0;
        bitIndex += 1;
      }
    }
    upward = !upward;
  }
}

const MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function applyMask(m, maskIndex) {
  const size = m.size;
  const out = m.modules.map((row) => row.slice());
  const mask = MASKS[maskIndex];
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      if (m.reserved[r][c]) continue;
      if (mask(r, c)) out[r][c] ^= 1;
    }
  }
  return out;
}

function penalty(modules) {
  const size = modules.length;
  let score = 0;

  // Rule 1: runs of 5+ same-colour modules in rows and columns.
  for (let r = 0; r < size; r += 1) {
    let runColor = -1;
    let runLen = 0;
    for (let c = 0; c < size; c += 1) {
      const v = modules[r][c];
      if (v === runColor) {
        runLen += 1;
      } else {
        if (runLen >= 5) score += 3 + (runLen - 5);
        runColor = v;
        runLen = 1;
      }
    }
    if (runLen >= 5) score += 3 + (runLen - 5);
  }
  for (let c = 0; c < size; c += 1) {
    let runColor = -1;
    let runLen = 0;
    for (let r = 0; r < size; r += 1) {
      const v = modules[r][c];
      if (v === runColor) {
        runLen += 1;
      } else {
        if (runLen >= 5) score += 3 + (runLen - 5);
        runColor = v;
        runLen = 1;
      }
    }
    if (runLen >= 5) score += 3 + (runLen - 5);
  }

  // Rule 2: 2x2 blocks of the same colour.
  for (let r = 0; r < size - 1; r += 1) {
    for (let c = 0; c < size - 1; c += 1) {
      const v = modules[r][c];
      if (v === modules[r][c + 1] && v === modules[r + 1][c] && v === modules[r + 1][c + 1]) {
        score += 3;
      }
    }
  }

  // Rule 3: finder-like patterns in rows and columns.
  const p1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const p2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
  const matches = (arr, start, pattern) => pattern.every((p, i) => arr[start + i] === p);
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c <= size - 11; c += 1) {
      const row = modules[r];
      if (matches(row, c, p1) || matches(row, c, p2)) score += 40;
    }
  }
  for (let c = 0; c < size; c += 1) {
    const col = modules.map((row) => row[c]);
    for (let r = 0; r <= size - 11; r += 1) {
      if (matches(col, r, p1) || matches(col, r, p2)) score += 40;
    }
  }

  // Rule 4: balance of dark vs light modules.
  let dark = 0;
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) dark += modules[r][c];
  }
  const percent = (dark * 100) / (size * size);
  const prev = Math.floor(percent / 5) * 5;
  const next = prev + 5;
  score += Math.min(Math.abs(prev - 50), Math.abs(next - 50)) / 5 * 10;

  return score;
}

function bchFormat(data) {
  let value = data << 10;
  const g = 0b10100110111;
  for (let i = 14; i >= 10; i -= 1) {
    if ((value >>> i) & 1) value ^= g << (i - 10);
  }
  return ((data << 10) | value) ^ 0b101010000010010;
}

function bchVersion(version) {
  let value = version << 12;
  const g = 0b1111100100101;
  for (let i = 17; i >= 12; i -= 1) {
    if ((value >>> i) & 1) value ^= g << (i - 12);
  }
  return (version << 12) | value;
}

function placeFormat(modules, reserved, level, maskIndex) {
  const size = modules.length;
  const bits = bchFormat((EC_FORMAT_BITS[level] << 3) | maskIndex);
  const get = (i) => (bits >>> i) & 1;

  // Around top-left finder: bits 0-5 down column 8, corner cells, then bits 9-14 along row 8.
  for (let i = 0; i <= 5; i += 1) modules[i][8] = get(i);
  modules[7][8] = get(6);
  modules[8][8] = get(7);
  modules[8][7] = get(8);
  for (let i = 9; i <= 14; i += 1) modules[8][14 - i] = get(i);

  // Second copy: bits 0-7 along row 8 under the top-right finder, bits 8-14 down column 8
  // beside the bottom-left finder (the dark module at [size-8][8] stays untouched).
  for (let i = 0; i <= 7; i += 1) modules[8][size - 1 - i] = get(i);
  for (let i = 8; i <= 14; i += 1) modules[size - 15 + i][8] = get(i);
}

function placeVersionInfo(modules, version) {
  if (version < 7) return;
  const size = modules.length;
  const bits = bchVersion(version);
  for (let i = 0; i < 18; i += 1) {
    const bit = (bits >>> i) & 1;
    const a = Math.floor(i / 3);
    const b = (i % 3) + size - 11;
    modules[a][b] = bit;
    modules[b][a] = bit;
  }
}

function buildMatrix(text, level) {
  const bytes = Buffer.from(text, "utf8");
  const version = pickVersion(bytes.length, level);
  const size = 17 + version * 4;
  const m = createMatrix(size);

  placeFinder(m, 0, 0);
  placeFinder(m, 0, size - 7);
  placeFinder(m, size - 7, 0);
  placeAlignment(m, version);
  placeTiming(m);
  reserveFormatAreas(m, version);

  const codewords = interleave(buildDataCodewords(text, version, level), version, level);
  placeData(m, codewords);

  let best = null;
  for (let maskIndex = 0; maskIndex < 8; maskIndex += 1) {
    const masked = applyMask(m, maskIndex);
    placeFormat(masked, m.reserved, level, maskIndex);
    placeVersionInfo(masked, version);
    const score = penalty(masked);
    if (!best || score < best.score) best = { score, maskIndex, modules: masked };
  }
  return { modules: best.modules, version, size };
}

function qrMatrix(text, level = "M") {
  return buildMatrix(String(text), level).modules;
}

function qrSvg(text, { level = "M", scale = 8, margin = 4, dark = "#0b5b3c", light = "#ffffff" } = {}) {
  const modules = qrMatrix(text, level);
  const size = modules.length;
  const dim = (size + margin * 2) * scale;
  const rects = [];
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      if (modules[r][c]) {
        const x = (c + margin) * scale;
        const y = (r + margin) * scale;
        rects.push(`<rect x="${x}" y="${y}" width="${scale}" height="${scale}"/>`);
      }
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${dim}" height="${dim}" ` +
    `viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges" role="img" aria-label="Check-in QR code">` +
    `<rect width="${dim}" height="${dim}" fill="${light}"/>` +
    `<g fill="${dark}">${rects.join("")}</g></svg>`
  );
}

module.exports = { qrMatrix, qrSvg };
