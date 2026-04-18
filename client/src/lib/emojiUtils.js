export function normalizeEmojiText(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\uFE0E\uFE0F]/g, '')
    .replace(/\u200D/g, '')
    .trim()
    .toLowerCase();
}

export function formatEmojiNumber(value) {
  return Number(value || 0).toLocaleString('zh-CN');
}

export async function loadEmojiDataset() {
  const module = await import('../data/emojiData.json');
  return module.default || module;
}

export function createEmojiItems(dataset) {
  if (!dataset?.items) {
    return [];
  }

  return dataset.items.map((item) => ({
    ...item,
    displayName: item.zhName || item.name,
    searchIndex: normalizeEmojiText([
      item.emoji,
      item.emoji.replace(/[\uFE0E\uFE0F]/g, ''),
      item.code,
      item.code.replaceAll('-', ''),
      item.name,
      item.zhName,
      ...(item.keywordsZh || []),
      item.group,
      item.groupLabel,
      item.subgroup,
      item.subgroupLabel
    ].join(' '))
  }));
}

export function createEmojiLookup(items) {
  const byCode = new Map();
  const byEmoji = new Map();
  const byNormalizedEmoji = new Map();

  items.forEach((item) => {
    byCode.set(item.code, item);
    if (!byEmoji.has(item.emoji)) {
      byEmoji.set(item.emoji, item);
    }

    const normalized = normalizeEmojiText(item.emoji);
    if (!byNormalizedEmoji.has(normalized)) {
      byNormalizedEmoji.set(normalized, item);
    }
  });

  return { byCode, byEmoji, byNormalizedEmoji };
}

export function findEmojiItem(ref, lookup) {
  if (!ref || !lookup) {
    return null;
  }

  const byEmoji = lookup.byEmoji.get(ref);
  if (byEmoji) {
    return byEmoji;
  }

  return lookup.byNormalizedEmoji.get(normalizeEmojiText(ref)) || null;
}

export function uniqueEmojiValues(values) {
  return Array.from(new Set(values.filter(Boolean)));
}
