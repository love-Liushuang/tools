import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ToolPageShell from '../components/ToolPageShell';
import { useToast } from '../components/ToastProvider';
import { countTopicEmojis, emojiTopics } from '../data/emojiTopics';
import {
  createEmojiItems,
  createEmojiLookup,
  findEmojiItem,
  formatEmojiNumber,
  loadEmojiDataset,
  uniqueEmojiValues
} from '../lib/emojiUtils';
import { copyText } from '../lib/tool';


function EmojiTopicDetailPage() {
  const { topicId } = useParams();
  const [dataset, setDataset] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedKey, setSelectedKey] = useState('');
  const toast = useToast();

  const topic = useMemo(
    () => emojiTopics.find((item) => item.id === topicId) || null,
    [topicId]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setLoadError('');

      try {
        const nextDataset = await loadEmojiDataset();
        if (!cancelled) {
          setDataset(nextDataset);
        }
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

    loadData();

    return () => {
      cancelled = true;
    };
  }, []);

  const items = useMemo(() => createEmojiItems(dataset), [dataset]);
  const lookup = useMemo(() => createEmojiLookup(items), [items]);

  const resolvedSections = useMemo(() => {
    if (!topic) {
      return [];
    }

    return topic.sections.map((section) => ({
      ...section,
      items: uniqueEmojiValues(section.emojis || []).map((emojiValue) => {
        const hit = findEmojiItem(emojiValue, lookup);
        if (hit) {
          return hit;
        }

        return {
          emoji: emojiValue,
          code: '',
          name: '',
          displayName: '未映射条目',
          groupLabel: '',
          subgroupLabel: '',
          keywordsZh: [],
          isFallback: true
        };
      })
    }));
  }, [lookup, topic]);

  const topicItems = useMemo(
    () => resolvedSections.flatMap((section) => section.items),
    [resolvedSections]
  );

  const selectedEmoji = useMemo(() => {
    if (!topicItems.length) {
      return null;
    }
    return topicItems.find((item) => (item.code || item.emoji) === selectedKey) || topicItems[0];
  }, [selectedKey, topicItems]);

  useEffect(() => {
    if (!topicItems.length) {
      return;
    }

    const exists = topicItems.some((item) => (item.code || item.emoji) === selectedKey);
    if (!exists) {
      setSelectedKey(topicItems[0].code || topicItems[0].emoji);
    }
  }, [selectedKey, topicItems]);

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
      text = item.code || item.emoji;
      message = item.code ? `已复制编码 ${item.code}` : `已复制 ${item.emoji}`;
    }

    const ok = await copyText(text);
    if (ok) {
        toast.success(message);
    } else {
        toast.error('复制失败，请手动复制。');
    }
  }, [toast]);

  if (!topic) {
    return (
      <ToolPageShell title="Emoji 专题不存在" desc="当前专题未找到，可能已被移除或路径有误。">
        <div className="emoji-empty">
          <p>没有找到对应的 Emoji 专题。</p>
          <div className="emoji-topic-card-actions">
            <Link className="ghost-btn" to="/tools/emoji/topics">
              返回专题列表
            </Link>
          </div>
        </div>
      </ToolPageShell>
    );
  }

  return (
    <ToolPageShell
      title={`Emoji 专题：${topic.title}`}
      desc={topic.desc}
    >
      <div className="emoji-topic-shell">
        <div className="emoji-breadcrumb">
          <Link to="/tools/emoji">全部 Emoji</Link>
          <span>/</span>
          <Link to="/tools/emoji/topics">专题合集</Link>
          <span>/</span>
          <strong>{topic.title}</strong>
        </div>

        <div className="emoji-topic-hero emoji-topic-hero-detail">
          <div className="emoji-topic-title-block">
            <div className="emoji-topic-cover emoji-topic-cover-lg">{topic.coverEmoji}</div>
            <div>
              <div className="emoji-kicker">Topic Detail</div>
              <h2>{topic.title}</h2>
              <p>{topic.desc}</p>
              <div className="emoji-topic-tag-list">
                {topic.tags.map((tag) => (
                  <span key={`${topic.id}-${tag}`}>{tag}</span>
                ))}
              </div>
            </div>
          </div>

          <div className="emoji-stats-grid">
            <div className="emoji-stat-card">
              <span>专题 Emoji</span>
              <strong>{formatEmojiNumber(countTopicEmojis(topic))}</strong>
            </div>
            <div className="emoji-stat-card">
              <span>专题分区</span>
              <strong>{formatEmojiNumber(topic.sections.length)}</strong>
            </div>
            <div className="emoji-stat-card">
              <span>数据状态</span>
              <strong>{loading ? '加载中' : '已就绪'}</strong>
            </div>
            <div className="emoji-stat-card">
              <span>来源</span>
              <strong>Unicode</strong>
            </div>
          </div>
        </div>

        <div className="emoji-toolbar-actions">
          <Link className="ghost-btn" to="/tools/emoji/topics">
            返回专题列表
          </Link>
          <Link className="ghost-btn" to="/tools/emoji">
            查看全部 Emoji
          </Link>
        </div>

        {loading ? <p className="tool-message">正在加载专题 Emoji 数据...</p> : null}
        {loadError ? <p className="error">{loadError}</p> : null}

        {selectedEmoji ? (
          <div className="emoji-focus-card">
            <div className="emoji-focus-char">{selectedEmoji.emoji}</div>
            <div className="emoji-focus-content">
              <h3>{selectedEmoji.displayName}</h3>
              {selectedEmoji.name ? <p className="emoji-focus-en">{selectedEmoji.name}</p> : null}
              <p className="emoji-focus-meta">
                {[selectedEmoji.groupLabel, selectedEmoji.subgroupLabel, selectedEmoji.code]
                  .filter(Boolean)
                  .join(' · ') || '专题策划条目'}
              </p>
              {!!selectedEmoji.keywordsZh?.length && (
                <div className="emoji-keyword-list">
                  {selectedEmoji.keywordsZh.slice(0, 12).map((keyword) => (
                    <span key={`${selectedEmoji.code || selectedEmoji.emoji}-${keyword}`}>{keyword}</span>
                  ))}
                </div>
              )}
            </div>
            <div className="emoji-focus-actions">
              <button type="button" className="primary" onClick={() => handleCopy(selectedEmoji, 'emoji')}>
                复制 Emoji
              </button>
              <button type="button" className="btn-ghost" onClick={() => handleCopy(selectedEmoji, 'emoji-name')}>
                复制 Emoji + 名称
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => handleCopy(selectedEmoji, 'code')}
                disabled={!selectedEmoji.code}
              >
                复制编码
              </button>
            </div>
          </div>
        ) : null}

        <div className="emoji-section-list">
          {resolvedSections.map((section) => (
            <section key={`${topic.id}-${section.title}`} className="emoji-section">
              <div className="emoji-section-head">
                <div>
                  <h3>{section.title}</h3>
                  <p>{section.desc}</p>
                </div>
                <span>{formatEmojiNumber(section.items.length)} 个</span>
              </div>

              <div className="emoji-grid">
                {section.items.map((item) => {
                  const key = item.code || item.emoji;
                  return (
                    <button
                      key={`${topic.id}-${section.title}-${key}`}
                      type="button"
                      className={selectedEmoji && (selectedEmoji.code || selectedEmoji.emoji) === key ? 'emoji-card is-active' : 'emoji-card'}
                      title={item.displayName}
                      onClick={() => {
                        setSelectedKey(key);
                        handleCopy(item, 'emoji');
                      }}
                    >
                      <span className="emoji-card-char">{item.emoji}</span>
                      <span className="emoji-card-name">{item.displayName}</span>
                      <span className="emoji-card-sub">{item.subgroupLabel || section.title}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </ToolPageShell>
  );
}

export default EmojiTopicDetailPage;
