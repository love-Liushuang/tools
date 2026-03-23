import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import ToolPageShell from '../components/ToolPageShell';
import {
  copyEmojiText,
  createEmojiItems,
  formatEmojiNumber,
  loadEmojiDataset,
  normalizeEmojiText
} from '../lib/emojiUtils';

function EmojiListPage() {
  const [dataset, setDataset] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [searchText, setSearchText] = useState('');
  const [activeGroup, setActiveGroup] = useState('all');
  const [selectedCode, setSelectedCode] = useState('');
  const [statusText, setStatusText] = useState('');

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
    if (!statusText) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setStatusText('');
    }, 2200);

    return () => {
      window.clearTimeout(timer);
    };
  }, [statusText]);

  const items = useMemo(() => {
    return createEmojiItems(dataset);
  }, [dataset]);

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
          items: []
        });
      }
      groupMap.get(item.group).items.push(item);
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
    return items.find((item) => item.code === selectedCode) || filteredItems[0] || items[0];
  }, [filteredItems, items, selectedCode]);

  const groups = dataset?.groups || [];

  useEffect(() => {
    if (!filteredItems.length) {
      return;
    }

    const selectedVisible = filteredItems.some((item) => item.code === selectedCode);
    if (!selectedVisible) {
      setSelectedCode(filteredItems[0].code);
    }
  }, [filteredItems, selectedCode]);

  const handleCopy = async (item, mode) => {
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
      setLoadError('');
      setStatusText(message);
    } catch (error) {
      setLoadError('复制失败，请手动复制。');
    }
  };

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
          <label className="field-block emoji-search-field">
            <span>搜索 Emoji</span>
            <input
              type="text"
              placeholder="搜索表情、中文名称、英文名称、关键词或编码..."
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
          </label>

          <div className="emoji-toolbar-actions">
            <Link className="ghost-btn" to="/tools/emoji/topics">
              专题合集
            </Link>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setSearchText('');
                setActiveGroup('all');
              }}
              disabled={!searchText && activeGroup === 'all'}
            >
              重置筛选
            </button>
          </div>
        </div>

        <div className="emoji-group-bar">
          <button
            type="button"
            className={activeGroup === 'all' ? 'emoji-group-pill active' : 'emoji-group-pill'}
            onClick={() => setActiveGroup('all')}
          >
            全部
            <span>{formatEmojiNumber(dataset?.meta?.total)}</span>
          </button>
          {groups.map((group) => (
            <button
              key={group.key}
              type="button"
              className={activeGroup === group.key ? 'emoji-group-pill active' : 'emoji-group-pill'}
              onClick={() => setActiveGroup(group.key)}
            >
              {group.label}
              <span>{formatEmojiNumber(group.count)}</span>
            </button>
          ))}
        </div>

        {loading ? <p className="tool-message">正在加载 Emoji 数据...</p> : null}
        {loadError ? <p className="error">{loadError}</p> : null}
        {statusText ? <p className="status-text">{statusText}</p> : null}

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
              <section key={section.key} className="emoji-section">
                <div className="emoji-section-head">
                  <div>
                    <h3>{section.label}</h3>
                    <p>{section.key}</p>
                  </div>
                  <span>{formatEmojiNumber(section.count)} 个</span>
                </div>

                <div className="emoji-grid">
                  {section.items.map((item) => (
                    <button
                      key={item.code}
                      type="button"
                      className={selectedEmoji?.code === item.code ? 'emoji-card is-active' : 'emoji-card'}
                      title={`${item.displayName} (${item.name})`}
                      onClick={() => {
                        setSelectedCode(item.code);
                        handleCopy(item, 'emoji');
                      }}
                    >
                      <span className="emoji-card-char">{item.emoji}</span>
                      <span className="emoji-card-name">{item.displayName}</span>
                      <span className="emoji-card-sub">{item.subgroupLabel}</span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : null}
      </div>
    </ToolPageShell>
  );
}

export default EmojiListPage;
