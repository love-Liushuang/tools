const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const ABIGBOOK_OVERRIDES = {
  high: {
    0x00: 'TW', 0x4E: 'XQ', 0x4F: 'XP', 0x50: 'YW', 0x51: 'YV', 0x52: 'YU',
    0x53: 'YT', 0x54: 'YA', 0x55: 'YZ', 0x56: 'YY', 0x57: 'YX', 0x59: 'YN',
    0x5A: 'YC', 0x5B: 'YB', 0x5C: 'YS', 0x5E: 'YQ', 0x5F: 'YP', 0x60: 'ZW',
    0x62: 'ZU', 0x63: 'ZT', 0x64: 'ZA', 0x65: 'ZZ', 0x66: 'ZY', 0x67: 'ZX',
    0x69: 'ZN', 0x6B: 'ZB', 0x6C: 'ZS', 0x6D: 'ZR', 0x6E: 'ZQ', 0x70: 'AW',
    0x71: 'AV', 0x72: 'AU', 0x73: 'AT', 0x75: 'AZ', 0x76: 'AY', 0x77: 'AX',
    0x79: 'AN', 0x7B: 'AB', 0x7D: 'AR', 0x7E: 'AQ', 0x7F: 'AP', 0x80: 'BW',
    0x82: 'BU', 0x83: 'BT', 0x86: 'BY', 0x88: 'BO', 0x89: 'BN', 0x8B: 'BB',
    0x8C: 'BS', 0x8D: 'BR', 0x8F: 'BP', 0x90: 'CW', 0x91: 'CV', 0x94: 'CA',
    0x95: 'CZ', 0x96: 'CY', 0x97: 'CX', 0x98: 'CO', 0x9B: 'CB', 0x9C: 'CS',
    0x9E: 'CQ', 0x9F: 'CP'
  },
  low: {
    0x00: 'WR', 0x01: 'WS', 0x03: 'WQ', 0x06: 'WB', 0x07: 'WC', 0x08: 'WZ',
    0x09: 'WA', 0x0D: 'WW', 0x0E: 'WT', 0x0F: 'WU', 0x11: 'VS', 0x12: 'VP',
    0x14: 'VN', 0x16: 'VB', 0x18: 'VZ', 0x1A: 'VX', 0x1B: 'VY', 0x1F: 'VU',
    0x20: 'UR', 0x25: 'UO', 0x26: 'UB', 0x27: 'UC', 0x28: 'UZ', 0x29: 'UA',
    0x2B: 'UY', 0x2E: 'UT', 0x2F: 'UU', 0x30: 'TR', 0x31: 'TS', 0x32: 'TP',
    0x33: 'TQ', 0x34: 'TN', 0x35: 'TO', 0x36: 'TB', 0x37: 'TC', 0x38: 'TZ',
    0x39: 'TA', 0x3C: 'TV', 0x3F: 'TU', 0x40: 'AR', 0x41: 'AS', 0x42: 'AP',
    0x43: 'AQ', 0x48: 'AZ', 0x49: 'AA', 0x4B: 'AY', 0x4E: 'AT', 0x50: 'ZR',
    0x51: 'ZS', 0x52: 'ZP', 0x54: 'ZN', 0x56: 'ZB', 0x57: 'ZC', 0x5E: 'ZT',
    0x5F: 'ZU', 0x60: 'YR', 0x62: 'YP', 0x66: 'YB', 0x68: 'YZ', 0x71: 'XS',
    0x73: 'XQ', 0x77: 'XC', 0x78: 'XZ', 0x7B: 'XY', 0x7C: 'XV', 0x7D: 'XW',
    0x80: 'OR', 0x87: 'OC', 0x89: 'OA', 0x8B: 'OY', 0x8C: 'OV', 0x8D: 'OW',
    0x8E: 'OT', 0x90: 'NR', 0x91: 'NS', 0x93: 'NQ', 0x94: 'NN', 0x96: 'NB',
    0x97: 'NC', 0x98: 'NZ', 0x99: 'NA', 0x9A: 'NX', 0x9D: 'NW', 0x9E: 'NT',
    0x9F: 'NU', 0xA0: 'CR', 0xA1: 'CS', 0xA3: 'CQ', 0xA7: 'CC', 0xAA: 'CX',
    0xAD: 'CW', 0xAF: 'CU', 0xB0: 'BR', 0xB2: 'BP', 0xB9: 'BA', 0xBA: 'BX',
    0xBB: 'BY', 0xBD: 'BW', 0xBF: 'BU', 0xC0: 'SR', 0xC1: 'SS', 0xC2: 'SP',
    0xC4: 'SN', 0xC5: 'SO', 0xC6: 'SB', 0xC7: 'SC', 0xCD: 'SW', 0xCE: 'ST',
    0xD0: 'RR', 0xD1: 'RS', 0xD3: 'RQ', 0xD4: 'RN', 0xD7: 'RC', 0xD8: 'RZ',
    0xDB: 'RY', 0xDC: 'RV', 0xDD: 'RW', 0xDE: 'RT', 0xDF: 'RU', 0xE0: 'QR',
    0xE1: 'QS', 0xE3: 'QQ', 0xE5: 'QO', 0xE8: 'QZ', 0xE9: 'QA', 0xEA: 'QX',
    0xEC: 'QV', 0xF0: 'PR', 0xF1: 'PS', 0xF3: 'PQ', 0xF4: 'PN', 0xFB: 'PY',
    0xFD: 'PW'
  }
};

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function createRng(seed) {
  let x = seed >>> 0;
  return function next() {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 0x100000000;
  };
}

function buildPairPool() {
  const pairs = [];
  for (let i = 0; i < LETTERS.length; i += 1) {
    for (let j = 0; j < LETTERS.length; j += 1) {
      pairs.push(LETTERS[i] + LETTERS[j]);
    }
  }
  return pairs;
}

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

function normalizeOverrideMap(overrideMap) {
  const out = new Map();
  for (const key in overrideMap) {
    if (Object.prototype.hasOwnProperty.call(overrideMap, key)) {
      out.set(Number(key), overrideMap[key]);
    }
  }
  return out;
}

function buildTable(password, role, overrideObj) {
  const seed = fnv1a(role + '|' + password);
  const rng = createRng(seed);
  const allPairs = buildPairPool();
  shuffle(allPairs, rng);

  const map = new Array(256);
  const reverse = new Map();
  const used = new Set();

  const overrides = normalizeOverrideMap(overrideObj || {});
  for (const entry of overrides.entries()) {
    const byte = entry[0];
    const pair = entry[1];
    map[byte] = pair;
    reverse.set(pair, byte);
    used.add(pair);
  }

  let idx = 0;
  for (let b = 0; b < 256; b += 1) {
    if (map[b]) {
      continue;
    }
    while (idx < allPairs.length && used.has(allPairs[idx])) {
      idx += 1;
    }
    if (idx >= allPairs.length) {
      throw new Error('Pair table exhausted');
    }
    const pair = allPairs[idx++];
    map[b] = pair;
    reverse.set(pair, b);
    used.add(pair);
  }

  return { map, reverse };
}

function resolveOverrides(password) {
  if (password === 'abigbook') {
    return ABIGBOOK_OVERRIDES;
  }
  return { high: {}, low: {} };
}

function makeCodec(password) {
  const ov = resolveOverrides(password);
  const hi = buildTable(password, 'HIGH', ov.high);
  const lo = buildTable(password, 'LOW', ov.low);
  return {
    encodeMapHigh: hi.map,
    encodeMapLow: lo.map,
    decodeMapHigh: hi.reverse,
    decodeMapLow: lo.reverse
  };
}

function encrypt(text, password) {
  const codec = makeCodec(password || '');
  let out = '';

  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    const highByte = (code >> 8) & 0xff;
    const lowByte = code & 0xff;
    out += codec.encodeMapHigh[highByte] + codec.encodeMapLow[lowByte];
  }

  return out + '==';
}

function decrypt(cipherText, password) {
  const codec = makeCodec(password || '');
  const clean = cipherText.replace(/\s+/g, '').replace(/=+$/, '');

  if (!clean) {
    return '';
  }
  if (!/^[A-Z]+$/.test(clean)) {
    throw new Error('密文只允许大写字母 A-Z（可带末尾==）');
  }
  if (clean.length % 4 !== 0) {
    throw new Error('密文长度不正确，应为4的倍数（不含==）');
  }

  let out = '';
  for (let i = 0; i < clean.length; i += 4) {
    const hiPair = clean.slice(i, i + 2);
    const loPair = clean.slice(i + 2, i + 4);
    const highByte = codec.decodeMapHigh.get(hiPair);
    const lowByte = codec.decodeMapLow.get(loPair);

    if (highByte === undefined || lowByte === undefined) {
      throw new Error('密文与当前密码不匹配，或密文无效');
    }

    const code = (highByte << 8) | lowByte;
    out += String.fromCharCode(code);
  }

  return out;
}

module.exports = {
  encrypt,
  decrypt
};
