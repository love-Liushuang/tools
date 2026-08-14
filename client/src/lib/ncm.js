import { ecb } from '@noble/ciphers/aes.js';

const CORE_KEY = Uint8Array.from([
  0x68, 0x7a, 0x48, 0x52, 0x41, 0x6d, 0x73, 0x6f,
  0x35, 0x6b, 0x49, 0x6e, 0x62, 0x61, 0x78, 0x57
]);
const META_KEY = Uint8Array.from([
  0x23, 0x31, 0x34, 0x6c, 0x6a, 0x6b, 0x5f, 0x21,
  0x5c, 0x5d, 0x26, 0x30, 0x55, 0x3c, 0x27, 0x28
]);
const MAGIC_HEADER = Uint8Array.from([0x43, 0x54, 0x45, 0x4e, 0x46, 0x44, 0x41, 0x4d]);
const AUDIO_CHUNK_SIZE = 1024 * 1024;
const MAX_SECTION_SIZE = 64 * 1024 * 1024;

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder('utf-8');

class NcmReader {
  constructor(buffer) {
    this.bytes = new Uint8Array(buffer);
    this.view = new DataView(buffer);
    this.offset = 0;
  }

  ensure(length, label) {
    if (!Number.isInteger(length) || length < 0 || this.offset + length > this.bytes.length) {
      throw new Error(`NCM 文件已损坏：${label}越界。`);
    }
  }

  readUint32(label) {
    this.ensure(4, label);
    const value = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return value;
  }

  readBytes(length, label) {
    this.ensure(length, label);
    const value = this.bytes.slice(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }

  skip(length, label) {
    this.ensure(length, label);
    this.offset += length;
  }
}

function bytesEqual(left, right) {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
}

function xorBytes(bytes, value) {
  return bytes.map((byte) => byte ^ value);
}

function decryptAesEcb(cipherText, key, label) {
  if (!cipherText.length || cipherText.length % 16 !== 0) {
    throw new Error(`NCM 文件已损坏：${label}长度无效。`);
  }

  try {
    return ecb(key).decrypt(cipherText);
  } catch (error) {
    throw new Error(`NCM 文件已损坏：${label}解密失败。`);
  }
}

function decodeBase64(value) {
  try {
    const binary = globalThis.atob(value);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch (error) {
    throw new Error('NCM 文件已损坏：元数据编码无效。');
  }
}

function parseMetadata(reader) {
  const length = reader.readUint32('元数据长度');
  if (length === 0) {
    return null;
  }
  if (length > MAX_SECTION_SIZE) {
    throw new Error('NCM 文件已损坏：元数据区域过大。');
  }

  const obfuscated = xorBytes(reader.readBytes(length, '元数据'), 0x63);
  const prefixLength = 22; // `163 key(Don't modify):`
  if (obfuscated.length <= prefixLength) {
    throw new Error('NCM 文件已损坏：元数据内容不完整。');
  }

  const base64Text = utf8Decoder.decode(obfuscated.slice(prefixLength)).replace(/\0+$/g, '');
  const plain = decryptAesEcb(decodeBase64(base64Text), META_KEY, '元数据');
  const jsonText = utf8Decoder.decode(plain.slice(6)).replace(/\0+$/g, ''); // 跳过 `music:`

  try {
    const metadata = JSON.parse(jsonText);
    return metadata?.mainMusic || metadata;
  } catch (error) {
    throw new Error('NCM 文件已损坏：无法解析歌曲信息。');
  }
}

function buildKeyBox(keyData) {
  if (!keyData.length) {
    throw new Error('NCM 文件已损坏：音频密钥为空。');
  }

  const box = Uint8Array.from({ length: 256 }, (_, index) => index);
  let lastByte = 0;
  let keyOffset = 0;

  // NCM 使用的流解密表与标准 RC4 PRGA 不同，必须保持这一索引方式。
  for (let index = 0; index < 256; index += 1) {
    const current = box[index];
    const swapIndex = (current + lastByte + keyData[keyOffset]) & 0xff;
    keyOffset = (keyOffset + 1) % keyData.length;
    box[index] = box[swapIndex];
    box[swapIndex] = current;
    lastByte = swapIndex;
  }

  return box;
}

function parseCover(reader) {
  reader.skip(5, '校验信息');
  const frameStart = reader.offset;
  const frameLength = reader.readUint32('封面区域长度');
  const imageLength = reader.readUint32('封面长度');
  const remaining = reader.bytes.length - reader.offset;

  // 旧版 NCM 只有一个图片长度字段；第二个数此时其实是音频或图片头。
  if (imageLength > frameLength || frameLength > remaining) {
    reader.offset = frameStart;
    const legacyImageLength = reader.readUint32('封面长度');
    if (legacyImageLength > MAX_SECTION_SIZE) {
      throw new Error('NCM 文件已损坏：封面区域过大。');
    }
    return reader.readBytes(legacyImageLength, '封面数据');
  }

  if (frameLength > MAX_SECTION_SIZE) {
    throw new Error('NCM 文件已损坏：封面区域过大。');
  }
  const image = reader.readBytes(imageLength, '封面数据');
  reader.skip(frameLength - imageLength, '封面填充');
  return image;
}

function detectAudioFormat(bytes, metadataFormat = '') {
  if (bytes.length >= 4 && utf8Decoder.decode(bytes.slice(0, 4)) === 'fLaC') {
    return 'flac';
  }
  if (bytes.length >= 3 && utf8Decoder.decode(bytes.slice(0, 3)) === 'ID3') {
    return 'mp3';
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xf0) === 0xf0) {
    // ADTS AAC 的 layer 位恒为 00；MP3 的 layer 位至少有一位为 1。
    return (bytes[1] & 0x06) === 0 ? 'aac' : 'mp3';
  }
  if (bytes.length >= 4 && utf8Decoder.decode(bytes.slice(0, 4)) === 'OggS') {
    return 'ogg';
  }

  const normalized = String(metadataFormat || '').toLowerCase();
  return ['mp3', 'flac', 'aac', 'ogg'].includes(normalized) ? normalized : 'unknown';
}

function createAbortError() {
  const error = new Error('转换已停止。');
  error.code = 'NCM_ABORTED';
  return error;
}

function yieldToBrowser() {
  return new Promise((resolve) => globalThis.setTimeout(resolve, 0));
}

async function decryptAudio(encrypted, keyBox, onProgress, shouldAbort) {
  for (let start = 0; start < encrypted.length; start += AUDIO_CHUNK_SIZE) {
    if (shouldAbort?.()) {
      throw createAbortError();
    }

    const end = Math.min(encrypted.length, start + AUDIO_CHUNK_SIZE);
    for (let index = start; index < end; index += 1) {
      const streamIndex = (index + 1) & 0xff;
      const keyIndex = (
        keyBox[streamIndex]
        + keyBox[(keyBox[streamIndex] + streamIndex) & 0xff]
      ) & 0xff;
      encrypted[index] ^= keyBox[keyIndex];
    }

    onProgress?.(end / encrypted.length);
    if (end < encrypted.length) {
      await yieldToBrowser();
    }
  }
}

function parseArtists(metadata) {
  const artists = metadata?.artist || metadata?.artists;
  if (!Array.isArray(artists)) {
    return typeof artists === 'string' ? artists : '';
  }
  return artists
    .map((artist) => (Array.isArray(artist) ? artist[0] : artist?.name || artist))
    .filter(Boolean)
    .join(' / ');
}

function concatBytes(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  parts.forEach((part) => {
    output.set(part, offset);
    offset += part.length;
  });
  return output;
}

function uint32Bytes(value) {
  return Uint8Array.from([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff
  ]);
}

function synchsafeBytes(value) {
  return Uint8Array.from([
    (value >>> 21) & 0x7f,
    (value >>> 14) & 0x7f,
    (value >>> 7) & 0x7f,
    value & 0x7f
  ]);
}

function utf16Text(value) {
  const text = String(value || '');
  const output = new Uint8Array(3 + text.length * 2);
  output.set([0x01, 0xff, 0xfe]); // ID3v2.3 文本编码标记 + UTF-16LE BOM
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    output[3 + index * 2] = code & 0xff;
    output[4 + index * 2] = code >>> 8;
  }
  return output;
}

function createId3Frame(id, body) {
  return concatBytes([
    utf8Encoder.encode(id),
    uint32Bytes(body.length),
    Uint8Array.from([0, 0]),
    body
  ]);
}

function detectImageMime(image) {
  const isPng = image.length >= 8
    && image[0] === 0x89
    && image[1] === 0x50
    && image[2] === 0x4e
    && image[3] === 0x47;
  return isPng ? 'image/png' : 'image/jpeg';
}

function createId3Tag(metadata, cover) {
  const frames = [];
  const title = metadata?.musicName || metadata?.title || '';
  const artist = parseArtists(metadata);
  const album = metadata?.album || '';

  if (title) frames.push(createId3Frame('TIT2', utf16Text(title)));
  if (artist) frames.push(createId3Frame('TPE1', utf16Text(artist)));
  if (album) frames.push(createId3Frame('TALB', utf16Text(album)));

  if (cover?.length) {
    const mime = utf8Encoder.encode(detectImageMime(cover));
    const body = concatBytes([
      Uint8Array.from([0x00]), // ISO-8859-1 description encoding
      mime,
      Uint8Array.from([0x00, 0x03, 0x00]), // MIME 结尾、封面类型、空描述
      cover
    ]);
    frames.push(createId3Frame('APIC', body));
  }

  if (!frames.length) {
    return null;
  }
  const body = concatBytes(frames);
  return concatBytes([
    utf8Encoder.encode('ID3'),
    Uint8Array.from([0x03, 0x00, 0x00]),
    synchsafeBytes(body.length),
    body
  ]);
}

function stripExistingId3(bytes) {
  if (bytes.length < 10 || utf8Decoder.decode(bytes.slice(0, 3)) !== 'ID3') {
    return bytes;
  }
  const size = (bytes[6] << 21) | (bytes[7] << 14) | (bytes[8] << 7) | bytes[9];
  const footerSize = (bytes[5] & 0x10) !== 0 ? 10 : 0;
  const audioOffset = 10 + size + footerSize;
  return audioOffset <= bytes.length ? bytes.slice(audioOffset) : bytes;
}

export function getNcmMetadata(metadata) {
  return {
    title: metadata?.musicName || metadata?.title || '',
    artist: parseArtists(metadata),
    album: metadata?.album || '',
    bitrate: Number(metadata?.bitrate) || 0,
    duration: Number(metadata?.duration) || 0
  };
}

export function createTaggedMp3Blob(audioBytes, metadata, cover) {
  const tag = createId3Tag(metadata, cover);
  const payload = tag
    ? concatBytes([tag, stripExistingId3(audioBytes)])
    : audioBytes;
  return new Blob([payload], { type: 'audio/mpeg' });
}

export function createMp3OutputName(sourceName, metadata) {
  const fallback = String(sourceName || 'audio').replace(/\.ncm$/i, '');
  const preferred = metadata?.musicName || metadata?.title || fallback;
  const safeName = String(preferred)
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 160) || fallback;
  return `${safeName}.mp3`;
}

export async function decryptNcmFile(file, { onProgress, shouldAbort } = {}) {
  const buffer = await file.arrayBuffer();
  const reader = new NcmReader(buffer);
  const header = reader.readBytes(MAGIC_HEADER.length, '文件头');
  if (!bytesEqual(header, MAGIC_HEADER)) {
    throw new Error('不是有效的 NCM 文件。');
  }

  reader.skip(2, '版本信息');
  const keyLength = reader.readUint32('密钥长度');
  if (keyLength === 0 || keyLength > MAX_SECTION_SIZE) {
    throw new Error('NCM 文件已损坏：密钥长度无效。');
  }
  const encryptedKey = xorBytes(reader.readBytes(keyLength, '音频密钥'), 0x64);
  const plainKey = decryptAesEcb(encryptedKey, CORE_KEY, '音频密钥');
  if (plainKey.length <= 17) {
    throw new Error('NCM 文件已损坏：音频密钥不完整。');
  }
  const keyBox = buildKeyBox(plainKey.slice(17));
  const metadata = parseMetadata(reader);
  const cover = parseCover(reader);

  if (reader.offset >= reader.bytes.length) {
    throw new Error('NCM 文件已损坏：缺少音频数据。');
  }
  const audio = reader.bytes.slice(reader.offset);
  await decryptAudio(audio, keyBox, onProgress, shouldAbort);

  return {
    audio,
    cover,
    metadata,
    format: detectAudioFormat(audio, metadata?.format)
  };
}
