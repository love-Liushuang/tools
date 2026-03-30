import { memo, startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import ToolPageShell from '../components/ToolPageShell';
import { useToast } from '../components/ToastProvider';
import {
  copyEmojiText,
  createEmojiItems,
  formatEmojiNumber,
  loadEmojiDataset,
  normalizeEmojiText
} from '../lib/emojiUtils';

const PREVIEW_SECTION_ITEMS = 72;
const FOCUSED_SECTION_ITEMS = 180;
const SECTION_LOAD_STEP = 180;

const EmojiCard = memo(function EmojiCard({ item, isActive, onSelect }) {
  return (
    <button
      type="button"
      className={isActive ? 'emoji-card is-active' : 'emoji-card'}
      title={`${item.displayName} (${item.name})`}
      onClick={() => onSelect(item)}
    >
      <span className="emoji-card-char">{item.emoji}</span>
      <span className="emoji-card-name">{item.displayName}</span>
      <span className="emoji-card-sub">{item.subgroupLabel}</span>
    </button>
  );
}, (prevProps, nextProps) => (
  prevProps.item === nextProps.item
  && prevProps.isActive === nextProps.isActive
  && prevProps.onSelect === nextProps.onSelect
));

const EmojiSection = memo(function EmojiSection({
  section,
  activeCode,
  isFocusedGroup,
  onFocusGroup,
  onSelect
}) {
  const initialVisibleCount = Math.min(
    section.items.length,
    isFocusedGroup ? FOCUSED_SECTION_ITEMS : PREVIEW_SECTION_ITEMS
  );
  const [visibleCount, setVisibleCount] = useState(initialVisibleCount);

  useEffect(() => {
    setVisibleCount(initialVisibleCount);
  }, [initialVisibleCount, section]);

  const activeIndex = useMemo(() => {
    if (!activeCode || !section.codeSet.has(activeCode)) {
      return -1;
    }

    return section.items.findIndex((item) => item.code === activeCode);
  }, [activeCode, section]);

  const resolvedVisibleCount = activeIndex >= 0
    ? Math.max(visibleCount, activeIndex + 1)
    : visibleCount;

  const visibleItems = useMemo(
    () => section.items.slice(0, resolvedVisibleCount),
    [resolvedVisibleCount, section.items]
  );

  const remainingCount = section.items.length - resolvedVisibleCount;
  const nextLoadCount = Math.min(SECTION_LOAD_STEP, remainingCount);
  const shouldShowFooter = remainingCount > 0 || !isFocusedGroup;

  const handleLoadMore = useCallback(() => {
    setVisibleCount((prev) => Math.min(prev + SECTION_LOAD_STEP, section.items.length));
  }, [section.items.length]);

  return (
    <section className="emoji-section">
      <div className="emoji-section-head">
        <div>
          <h3>{section.label}</h3>
          <p>{section.key}</p>
        </div>
        <span>{formatEmojiNumber(section.count)} 个</span>
      </div>

      <div className="emoji-grid">
        {visibleItems.map((item) => (
          <EmojiCard
            key={item.code}
            item={item}
            isActive={activeCode === item.code}
            onSelect={onSelect}
          />
        ))}
      </div>

      {shouldShowFooter ? (
        <div className="emoji-section-footer">
          <p>
            已显示 {formatEmojiNumber(visibleItems.length)} / {formatEmojiNumber(section.count)} 个
          </p>
          <div className="emoji-section-footer-actions">
            {remainingCount > 0 ? (
              <button
                type="button"
                className="btn-ghost emoji-load-more-btn"
                onClick={handleLoadMore}
              >
                继续加载 {formatEmojiNumber(nextLoadCount)} 个
              </button>
            ) : null}
            {!isFocusedGroup ? (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => onFocusGroup(section.key)}
              >
                只看本组
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}, (prevProps, nextProps) => {
  if (prevProps.section !== nextProps.section) {
    return false;
  }

  if (prevProps.onSelect !== nextProps.onSelect) {
    return false;
  }

  if (prevProps.onFocusGroup !== nextProps.onFocusGroup) {
    return false;
  }

  if (prevProps.isFocusedGroup !== nextProps.isFocusedGroup) {
    return false;
  }

  if (prevProps.activeCode === nextProps.activeCode) {
    return true;
  }

  const { codeSet } = prevProps.section;
  return !codeSet.has(prevProps.activeCode) && !codeSet.has(nextProps.activeCode);
});

function EmojiListPage() {
  const [dataset, setDataset] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [searchText, setSearchText] = useState('');
  const [activeGroup, setActiveGroup] = useState('all');
  const [selectedCode, setSelectedCode] = useState('');
  const [showBackToTop, setShowBackToTop] = useState(false);
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;

    async function loadEmojiData() {
      setLoading(true);
      setLoadError('');

      try {
        const nextDataset = await loadEmojiDataset();
        if (cancelled) {
          return;
        }

        setDataset(nextDataset);
        setSelectedCode(nextDataset?.items?.[0]?.code || '');
      } catch (error) {
        if (!cancelled) {
          setLoadError(error.message || 'Emoji 数据加载失败。');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadEmojiData();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      const shouldShow = window.scrollY > 720;
      setShowBackToTop((prev) => (prev === shouldShow ? prev : shouldShow));
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const items = useMemo(() => {
    return createEmojiItems(dataset);
  }, [dataset]);

  const itemMap = useMemo(() => {
    return new Map(items.map((item) => [item.code, item]));
  }, [items]);

  const normalizedSearch = useMemo(() => normalizeEmojiText(searchText), [searchText]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (activeGroup !== 'all' && item.group !== activeGroup) {
        return false;
      }
      if (normalizedSearch && !item.searchIndex.includes(normalizedSearch)) {
        return false;
      }
      return true;
    });
  }, [activeGroup, items, normalizedSearch]);

  const sectionList = useMemo(() => {
    const groupMap = new Map();

    filteredItems.forEach((item) => {
      if (!groupMap.has(item.group)) {
        groupMap.set(item.group, {
          key: item.group,
          label: item.groupLabel,
          items: [],
          codeSet: new Set()
        });
      }

      const section = groupMap.get(item.group);
      section.items.push(item);
      section.codeSet.add(item.code);
    });

    const order = dataset?.groups || [];
    return order
      .map((group) => {
        const section = groupMap.get(group.key);
        if (!section) {
          return null;
        }

        return {
          ...section,
          count: section.items.length
        };
      })
      .filter(Boolean);
  }, [dataset, filteredItems]);

  const selectedEmoji = useMemo(() => {
    if (!items.length) {
      return null;
    }

    const selectedVisible = filteredItems.some((item) => item.code === selectedCode);
    if (selectedVisible) {
      return itemMap.get(selectedCode) || filteredItems[0] || items[0];
    }

    return filteredItems[0] || items[0];
  }, [filteredItems, itemMap, items, selectedCode]);

  const groups = dataset?.groups || [];
  const isFocusedGroup = activeGroup !== 'all';

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    const nextSearch = searchInput.trim();
    startTransition(() => {
      setSearchText(nextSearch);
    });
  };

  const handleBackToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };

  const handleCopy = useCallback(async (item, mode) => {
    if (!item) {
      return;
    }

    let text = item.emoji;
    let message = `已复制 ${item.emoji}`;

    if (mode === 'emoji-name') {
      text = `${item.emoji} ${item.displayName}`;
      message = `已复制 ${item.displayName}`;
    } else if (mode === 'code') {
      text = item.code;
      message = `已复制编码 ${item.code}`;
    }

    try {
      await copyEmojiText(text);
      toast.success(message);
    } catch (error) {
      toast.error('复制失败，请手动复制。');
    }
  }, [toast]);

  const handleCardSelect = useCallback((item) => {
    startTransition(() => {
      setSelectedCode(item.code);
    });
    void handleCopy(item, 'emoji');
  }, [handleCopy]);

  const handleGroupChange = useCallback((groupKey) => {
    startTransition(() => {
      setActiveGroup(groupKey);
    });
  }, []);

  const handleResetFilters = useCallback(() => {
    startTransition(() => {
      setSearchInput('');
      setSearchText('');
      setActiveGroup('all');
    });
  }, []);

  useEffect(() => {
    if (!filteredItems.length) {
      return;
    }

    const selectedVisible = filteredItems.some((item) => item.code === selectedCode);
    if (!selectedVisible) {
      startTransition(() => {
        setSelectedCode(filteredItems[0].code);
      });
    }
  }, [filteredItems, selectedCode]);

  return (
    <ToolPageShell
      title="Emoji 全量列表"
      desc="基于 Unicode 官方 Emoji 数据，支持中文搜索、分组浏览与点击复制。"
    >
      <div className="emoji-shell">
        <div className="emoji-hero">
          <div>
            <div className="emoji-kicker">Unicode Emoji</div>
            <div className="emoji-kicker">Version: {dataset?.meta?.version || '17.0'}</div>
            <h2>全量 Emoji 清单</h2>
            <p>
              页面支持按分组浏览、中文关键词搜索、点击复制，也可以继续进入专题合集按场景挑选。
            </p>
          </div>

          <div className="emoji-stats-grid">
            <div className="emoji-stat-card">
              <span>Emoji 总数</span>
              <strong>{formatEmojiNumber(dataset?.meta?.total)}</strong>
            </div>
            <div className="emoji-stat-card">
              <span>Unicode 版本</span>
              <strong>{dataset?.meta?.version || '-'}</strong>
            </div>
            <div className="emoji-stat-card">
              <span>当前结果</span>
              <strong>{formatEmojiNumber(filteredItems.length)}</strong>
            </div>
            <div className="emoji-stat-card">
              <span>分组数量</span>
              <strong>{formatEmojiNumber(groups.length)}</strong>
            </div>
          </div>
        </div>

        <div className="emoji-toolbar">
          <form className="emoji-search-form" onSubmit={handleSearchSubmit}>
            <label className="field-block emoji-search-field">
              <span>搜索 Emoji</span>
              <div className="emoji-search-input-row">
                <input
                  type="text"
                  placeholder="搜索表情、中文名称、英文名称、关键词或编码..."
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                />
                <button
                  type="submit"
                  className="primary emoji-search-submit"
                  disabled={searchInput.trim() === searchText}
                >
                  搜索
                </button>
              </div>
            </label>
          </form>

          <div className="emoji-toolbar-actions">
            <Link className="ghost-btn" to="/tools/emoji/topics">
              专题合集
            </Link>
            <button
              type="button"
              className="btn-ghost"
              onClick={handleResetFilters}
              disabled={!searchInput && !searchText && activeGroup === 'all'}
            >
              重置筛选
            </button>
          </div>
        </div>

        <div className="emoji-group-bar">
          <button
            type="button"
            className={activeGroup === 'all' ? 'emoji-group-pill active' : 'emoji-group-pill'}
            onClick={() => handleGroupChange('all')}
          >
            全部
            <span>{formatEmojiNumber(dataset?.meta?.total)}</span>
          </button>
          {groups.map((group) => (
            <button
              key={group.key}
              type="button"
              className={activeGroup === group.key ? 'emoji-group-pill active' : 'emoji-group-pill'}
              onClick={() => handleGroupChange(group.key)}
            >
              {group.label}
              <span>{formatEmojiNumber(group.count)}</span>
            </button>
          ))}
        </div>

        {loading ? <p className="tool-message">正在加载 Emoji 数据...</p> : null}
        {loadError ? <p className="error">{loadError}</p> : null}

        {selectedEmoji ? (
          <div className="emoji-focus-card">
            <div className="emoji-focus-char">{selectedEmoji.emoji}</div>
            <div className="emoji-focus-content">
              <h3>{selectedEmoji.displayName}</h3>
              <p className="emoji-focus-en">{selectedEmoji.name}</p>
              <p className="emoji-focus-meta">
                {selectedEmoji.groupLabel} · {selectedEmoji.subgroupLabel} · {selectedEmoji.code}
              </p>
              {!!selectedEmoji.keywordsZh?.length && (
                <div className="emoji-keyword-list">
                  {selectedEmoji.keywordsZh.slice(0, 12).map((keyword) => (
                    <span key={`${selectedEmoji.code}-${keyword}`}>{keyword}</span>
                  ))}
                </div>
              )}
            </div>
            <div className="emoji-focus-actions">
              <button
                type="button"
                className="primary"
                onClick={() => handleCopy(selectedEmoji, 'emoji')}
              >
                复制 Emoji
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => handleCopy(selectedEmoji, 'emoji-name')}
              >
                复制 Emoji + 名称
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => handleCopy(selectedEmoji, 'code')}
              >
                复制编码
              </button>
            </div>
          </div>
        ) : null}

        {!loading && !filteredItems.length ? (
          <div className="emoji-empty">
            没有匹配的 Emoji，试试搜索中文别名、英文名或者 Unicode 编码。
          </div>
        ) : null}

        {!loading && !!filteredItems.length ? (
          <div className="emoji-section-list">
            {sectionList.map((section) => (
              <EmojiSection
                key={section.key}
                section={section}
                activeCode={selectedEmoji?.code || ''}
                isFocusedGroup={isFocusedGroup}
                onFocusGroup={handleGroupChange}
                onSelect={handleCardSelect}
              />
            ))}
          </div>
        ) : null}

        {showBackToTop ? (
          <button
            type="button"
            className="emoji-back-to-top"
            onClick={handleBackToTop}
            aria-label="回到页面顶部"
          >
            回到顶部
          </button>
        ) : null}
      </div>
    </ToolPageShell>
  );
}

export default EmojiListPage;
