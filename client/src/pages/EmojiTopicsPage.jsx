import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import ToolPageShell from '../components/ToolPageShell';
import { countTopicEmojis, emojiTopics } from '../data/emojiTopics';
import { formatEmojiNumber, normalizeEmojiText } from '../lib/emojiUtils';

function EmojiTopicsPage() {
  const [searchText, setSearchText] = useState('');

  const normalizedSearch = useMemo(() => normalizeEmojiText(searchText), [searchText]);

  const totalEmojiCount = useMemo(() => {
    const values = new Set();
    emojiTopics.forEach((topic) => {
      topic.sections.forEach((section) => {
        (section.emojis || []).forEach((emoji) => values.add(emoji));
      });
    });
    return values.size;
  }, []);

  const visibleTopics = useMemo(() => {
    if (!normalizedSearch) {
      return emojiTopics;
    }

    return emojiTopics.filter((topic) => {
      const searchIndex = normalizeEmojiText([
        topic.title,
        topic.desc,
        ...(topic.tags || []),
        ...topic.sections.map((section) => [section.title, section.desc, ...(section.emojis || [])].join(' '))
      ].join(' '));
      return searchIndex.includes(normalizedSearch);
    });
  }, [normalizedSearch]);

  return (
    <ToolPageShell
      title="Emoji 专题合集"
      desc="按使用场景策划的 Emoji 主题集合，适合节日、海报、文案和运营活动快速取用。"
    >
      <div className="emoji-topic-shell">
        <div className="emoji-topic-hero">
          <div>
            <div className="emoji-kicker">Curated Topics</div>
            <h2>Emoji 专题</h2>
            <p>
              适合节日运营、社交文案、视觉设计和活动页快速选取。
            </p>
          </div>

          <div className="emoji-stats-grid">
            <div className="emoji-stat-card">
              <span>专题数量</span>
              <strong>{formatEmojiNumber(emojiTopics.length)}</strong>
            </div>
            <div className="emoji-stat-card">
              <span>覆盖 Emoji</span>
              <strong>{formatEmojiNumber(totalEmojiCount)}</strong>
            </div>
            <div className="emoji-stat-card">
              <span>当前结果</span>
              <strong>{formatEmojiNumber(visibleTopics.length)}</strong>
            </div>
            <div className="emoji-stat-card">
              <span>适用场景</span>
              <strong>运营</strong>
            </div>
          </div>
        </div>

        <div className="emoji-toolbar">
          <label className="field-block emoji-search-field">
            <span>搜索专题</span>
            <input
              type="text"
              placeholder="搜索专题名、标签、描述或相关 Emoji..."
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
          </label>

          <div className="emoji-toolbar-actions">
            <Link className="ghost-btn" to="/tools/emoji">
              查看全部 Emoji
            </Link>
          </div>
        </div>

        {!visibleTopics.length ? (
          <div className="emoji-empty">
            没有匹配的专题，换一个关键词试试。
          </div>
        ) : (
          <div className="emoji-topic-grid">
            {visibleTopics.map((topic) => {
              const preview = Array.from(
                new Set(topic.sections.flatMap((section) => section.emojis || []))
              ).slice(0, 10);

              return (
                <article key={topic.id} className="emoji-topic-card">
                  <div className="emoji-topic-card-head">
                    <div className="emoji-topic-cover">{topic.coverEmoji}</div>
                    <div>
                      <h3>{topic.title}</h3>
                      <p>{topic.desc}</p>
                    </div>
                  </div>

                  <div className="emoji-topic-tag-list">
                    {topic.tags.map((tag) => (
                      <span key={`${topic.id}-${tag}`}>{tag}</span>
                    ))}
                  </div>

                  <div className="emoji-topic-meta">
                    <span>{formatEmojiNumber(topic.sections.length)} 个分区</span>
                    <span>{formatEmojiNumber(countTopicEmojis(topic))} 个 Emoji</span>
                  </div>

                  <div className="emoji-topic-preview">
                    {preview.map((emoji) => (
                      <span key={`${topic.id}-${emoji}`}>{emoji}</span>
                    ))}
                  </div>

                  <div className="emoji-topic-card-actions">
                    <Link className="ghost-btn" to={`/tools/emoji/topics/${topic.id}`}>
                      进入专题
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </ToolPageShell>
  );
}

export default EmojiTopicsPage;
