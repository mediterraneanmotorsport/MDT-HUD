/**
 * Zero-dependency ISO/IEC 18004 QR Code Matrix generator (Versions 1..5, ECC Level L, Byte Mode).
 * Generates a boolean[][] matrix ready to render as a crisp <svg> in Svelte.
 */

// Total data codewords and EC codewords per block for Level L, Versions 1..5 (all 1 block)
const VERSION_PARAMS: Record<number, { size: number; dataBytes: number; ecBytes: number; align: number[] }> = {
  1: { size: 21, dataBytes: 19, ecBytes: 7, align: [] },
  2: { size: 25, dataBytes: 34, ecBytes: 10, align: [6, 18] },
  3: { size: 29, dataBytes: 55, ecBytes: 15, align: [6, 22] },
  4: { size: 33, dataBytes: 80, ecBytes: 20, align: [6, 26] },
  5: { size: 37, dataBytes: 108, ecBytes: 26, align: [6, 30] },
};

function gfMul(x: number, y: number): number {
  let r = 0;
  for (let i = 7; i >= 0; i--) {
    r = (r << 1) ^ ((r >>> 7) * 0x11d);
    r ^= ((y >>> i) & 1) * x;
  }
  return r;
}

function reedSolomonCompute(data: number[], degree: number): number[] {
  const gen = new Array<number>(degree).fill(0);
  gen[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      gen[j] = gfMul(gen[j], root);
      if (j + 1 < degree) gen[j] ^= gen[j + 1];
    }
    root = gfMul(root, 2);
  }
  const result = new Array<number>(degree).fill(0);
  for (const b of data) {
    const factor = b ^ result[0];
    result.shift();
    result.push(0);
    for (let j = 0; j < degree; j++) {
      result[j] ^= gfMul(gen[j], factor);
    }
  }
  return result;
}

export function generateQrMatrix(text: string): boolean[][] {
  const utf8 = Array.from(new TextEncoder().encode(text));
  let ver = 3;
  for (let v = 1; v <= 5; v++) {
    if (utf8.length + 2 <= VERSION_PARAMS[v].dataBytes) {
      ver = v;
      break;
    }
  }
  const { size, dataBytes, ecBytes, align } = VERSION_PARAMS[ver];

  // Build bit stream: Mode 0100 (Byte), 8-bit char count, bytes, terminator, pad bytes
  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };
  pushBits(0b0100, 4);
  pushBits(utf8.length, 8);
  for (const b of utf8) pushBits(b, 8);
  const capacityBits = dataBytes * 8;
  pushBits(0, Math.min(4, capacityBits - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);
  for (let padIdx = 0; bits.length < capacityBits; padIdx++) {
    pushBits(padIdx % 2 === 0 ? 0xec : 0x11, 8);
  }

  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    codewords.push(b);
  }
  const ec = reedSolomonCompute(codewords, ecBytes);
  const allBytes = [...codewords, ...ec];

  const modules: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const isFunc: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));

  const setFunc = (x: number, y: number, dark: boolean) => {
    if (x >= 0 && x < size && y >= 0 && y < size) {
      modules[y][x] = dark;
      isFunc[y][x] = true;
    }
  };

  // Finder patterns + separators
  const drawFinder = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        setFunc(cx + dx, cy + dy, dist !== 2 && dist !== 4);
      }
    }
  };
  drawFinder(3, 3);
  drawFinder(size - 4, 3);
  drawFinder(3, size - 4);

  // Timing patterns
  for (let i = 0; i < size; i++) {
    if (!isFunc[6][i]) setFunc(i, 6, i % 2 === 0);
    if (!isFunc[i][6]) setFunc(6, i, i % 2 === 0);
  }

  // Alignment patterns
  for (const ay of align) {
    for (const ax of align) {
      if ((ax === 6 && ay === 6) || (ax === 6 && ay === size - 7) || (ax === size - 7 && ay === 6)) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          setFunc(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }
  }

  // Reserve format info & dark module
  for (let i = 0; i <= 8; i++) {
    if (i !== 6) {
      setFunc(8, i, false);
      setFunc(i, 8, false);
    }
    if (i < 8) {
      setFunc(size - 1 - i, 8, false);
      setFunc(8, size - 1 - i, false);
    }
  }
  setFunc(8, size - 8, true);

  // Place data bits in zigzag
  let bitIdx = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!isFunc[y][x] && bitIdx < allBytes.length * 8) {
          const dark = ((allBytes[bitIdx >>> 3] >>> (7 - (bitIdx & 7))) & 1) !== 0;
          modules[y][x] = dark;
          bitIdx++;
        }
      }
    }
  }

  // Apply Mask 0: (x + y) % 2 === 0
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!isFunc[y][x] && (x + y) % 2 === 0) {
        modules[y][x] = !modules[y][x];
      }
    }
  }

  // Format bits for Level L (01) + Mask 0 (000) -> 0b01000 -> BCH & XOR 0x5412 = 0x77c4
  const fmtBits = 0x77c4;
  const getBit = (i: number) => ((fmtBits >>> i) & 1) !== 0;
  for (let i = 0; i <= 5; i++) setFunc(8, i, getBit(i));
  setFunc(8, 7, getBit(6));
  setFunc(8, 8, getBit(7));
  setFunc(7, 8, getBit(8));
  for (let i = 9; i < 15; i++) setFunc(14 - i, 8, getBit(i));

  for (let i = 0; i < 8; i++) setFunc(size - 1 - i, 8, getBit(i));
  for (let i = 8; i < 15; i++) setFunc(8, size - 15 + i, getBit(i));
  setFunc(8, size - 8, true);

  return modules;
}
