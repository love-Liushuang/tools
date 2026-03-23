import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EMOJI_TEST_URL = 'https://www.unicode.org/Public/emoji/latest/emoji-test.txt';
const CLDR_ANNOTATIONS_URL = 'https://raw.githubusercontent.com/unicode-org/cldr-json/main/cldr-json/cldr-annotations-full/annotations/zh/annotations.json';
const CLDR_ANNOTATIONS_DERIVED_URL = 'https://raw.githubusercontent.com/unicode-org/cldr-json/main/cldr-json/cldr-annotations-derived-full/annotationsDerived/zh/annotations.json';

const GROUP_LABELS = {
  'Smileys & Emotion': '笑脸与情感',
  'People & Body': '人物与身体',
  'Component': '组件',
  'Animals & Nature': '动物与自然',
  'Food & Drink': '食物与饮品',
  'Travel & Places': '旅行与地点',
  'Activities': '活动',
  'Objects': '物品',
  'Symbols': '符号',
  'Flags': '旗帜'
};

const ACCEPTED_STATUSES = new Set(['fully-qualified', 'component']);

function unique(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

function toTitleCase(value) {
  return String(value || '')
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`请求失败：${response.status} ${response.statusText} (${url})`);
  }
  return response.text();
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`请求失败：${response.status} ${response.statusText} (${url})`);
  }
  return response.json();
}

function parseAnnotationPayload(payload) {
  const source = payload?.annotations?.annotations || {};
  const map = new Map();

  for (const [emoji, entry] of Object.entries(source)) {
    const defaults = Array.isArray(entry?.default)
      ? entry.default
      : typeof entry?.default === 'string'
        ? [entry.default]
        : [];
    const tts = Array.isArray(entry?.tts)
      ? entry.tts[0]
      : typeof entry?.tts === 'string'
        ? entry.tts
        : '';

    map.set(emoji, {
      name: tts || '',
      keywords: unique(defaults)
    });
  }

  return map;
}

function mergeAnnotations(primaryMap, secondaryMap) {
  const merged = new Map();
  const allKeys = new Set([...secondaryMap.keys(), ...primaryMap.keys()]);

  for (const key of allKeys) {
    const primary = primaryMap.get(key) || { name: '', keywords: [] };
    const secondary = secondaryMap.get(key) || { name: '', keywords: [] };
    merged.set(key, {
      name: primary.name || secondary.name || '',
      keywords: unique([...(primary.keywords || []), ...(secondary.keywords || [])])
    });
  }

  return merged;
}

function parseEmojiTest(content, annotations) {
  const lines = content.split(/\r?\n/);
  const items = [];
  let currentGroup = 'Other';
  let currentSubgroup = 'misc';
  let version = '';
  let date = '';
  const seen = new Set();

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    if (line.startsWith('# Version:')) {
      version = line.replace('# Version:', '').trim();
      continue;
    }

    if (line.startsWith('# Date:')) {
      date = line.replace('# Date:', '').trim();
      continue;
    }

    if (line.startsWith('# group:')) {
      currentGroup = line.replace('# group:', '').trim();
      continue;
    }

    if (line.startsWith('# subgroup:')) {
      currentSubgroup = line.replace('# subgroup:', '').trim();
      continue;
    }

    if (line.startsWith('#')) {
      continue;
    }

    const matched = line.match(/^([0-9A-F ]+)\s*;\s*([^#]+?)\s*#\s*(\S+)\s+E([\d.]+)\s+(.+)$/i);
    if (!matched) {
      continue;
    }

    const [, codepointsRaw, statusRaw, emoji, emojiVersion, englishName] = matched;
    const status = statusRaw.trim();
    if (!ACCEPTED_STATUSES.has(status)) {
      continue;
    }
    if (seen.has(emoji)) {
      continue;
    }
    seen.add(emoji);

    const annotation = annotations.get(emoji) || { name: '', keywords: [] };
    const codepoints = codepointsRaw.trim().split(/\s+/).filter(Boolean);

    items.push({
      emoji,
      code: codepoints.join('-'),
      name: englishName.trim(),
      zhName: annotation.name || '',
      keywordsZh: unique(annotation.keywords || []),
      group: currentGroup,
      groupLabel: GROUP_LABELS[currentGroup] || currentGroup,
      subgroup: currentSubgroup,
      subgroupLabel: toTitleCase(currentSubgroup),
      status,
      version: emojiVersion
    });
  }

  const groupCounter = new Map();
  for (const item of items) {
    groupCounter.set(item.group, (groupCounter.get(item.group) || 0) + 1);
  }

  const groups = Array.from(groupCounter.entries()).map(([group, count]) => ({
    key: group,
    label: GROUP_LABELS[group] || group,
    count
  }));

  return {
    meta: {
      version,
      date,
      total: items.length,
      generatedAt: new Date().toISOString(),
      sourceUrls: {
        emojiTest: EMOJI_TEST_URL,
        annotations: CLDR_ANNOTATIONS_URL,
        annotationsDerived: CLDR_ANNOTATIONS_DERIVED_URL
      }
    },
    groups,
    items
  };
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const rootDir = path.resolve(scriptDir, '..');
  const outputPath = path.join(rootDir, 'client', 'src', 'data', 'emojiData.json');

  console.log('正在拉取 Unicode Emoji 数据...');
  const [emojiTest, annotationsPayload, annotationsDerivedPayload] = await Promise.all([
    fetchText(EMOJI_TEST_URL),
    fetchJson(CLDR_ANNOTATIONS_URL),
    fetchJson(CLDR_ANNOTATIONS_DERIVED_URL)
  ]);

  console.log('正在整理中文注释与关键词...');
  const annotations = mergeAnnotations(
    parseAnnotationPayload(annotationsPayload),
    parseAnnotationPayload(annotationsDerivedPayload)
  );

  console.log('正在生成本地 Emoji 数据...');
  const emojiData = parseEmojiTest(emojiTest, annotations);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(emojiData)}\n`, 'utf8');

  console.log(`已生成 ${emojiData.meta.total} 条 Emoji 数据 -> ${outputPath}`);
  console.log(`Emoji 版本：${emojiData.meta.version}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
