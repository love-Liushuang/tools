import { useEffect, useMemo, useState } from 'react';
import ToolPageShell from '../components/ToolPageShell';

const PLATFORM_OPTIONS = [
    { key: 'all', label: '全网' },
    { key: 'weibo', label: '微博' },
    { key: 'zhihu', label: '知乎' },
    { key: 'douyin', label: '抖音' },
    { key: 'baidu', label: '百度' },
    { key: 'bilibili', label: 'B站' }
];

const PLATFORM_LABELS = {
    weibo: '微博热搜',
    zhihu: '知乎热榜',
    douyin: '抖音热点',
    baidu: '百度热搜',
    bilibili: 'B站热门'
};

const KNOWN_PLATFORMS = new Set(Object.keys(PLATFORM_LABELS));

function formatHot (value) {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) {
        return '';
    }
    if (num >= 100000000) {
        return `${(num / 100000000).toFixed(1)}亿`;
    }
    if (num >= 10000) {
        return `${(num / 10000).toFixed(1)}万`;
    }
    return `${num}`;
}

function formatTime (ts) {
    if (!ts) {
        return '未知';
    }
    const time = typeof ts === 'number' ? ts : Date.parse(ts);
    if (!Number.isFinite(time)) {
        return '未知';
    }
    const diff = Date.now() - time;
    if (diff < 60000) {
        return '刚刚';
    }
    if (diff < 3600000) {
        return `${Math.floor(diff / 60000)} 分钟前`;
    }
    if (diff < 86400000) {
        return `${Math.floor(diff / 3600000)} 小时前`;
    }
    const date = new Date(time);
    return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(
        date.getMinutes()
    ).padStart(2, '0')}`;
}

function normalizePlatform (value) {
    return String(value || '').trim().toLowerCase();
}

function getItemPlatform (item) {
    const direct = normalizePlatform(item?.platform);
    if (KNOWN_PLATFORMS.has(direct)) {
        return direct;
    }
    const key = String(item?.key || '');
    const prefix = normalizePlatform(key.split(':')[0]);
    if (KNOWN_PLATFORMS.has(prefix)) {
        return prefix;
    }
    const label = String(item?.platformLabel || '').trim();
    const labelEntry = Object.entries(PLATFORM_LABELS).find(([, value]) => value === label);
    if (labelEntry) {
        return labelEntry[0];
    }
    return '';
}

function getPlatformLabel (platform, fallback) {
    if (platform && PLATFORM_LABELS[platform]) {
        return PLATFORM_LABELS[platform];
    }
    return fallback || '未知平台';
}

function escapeRegExp (text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightText (text, terms) {
    const content = String(text || '');
    const cleanTerms = terms.filter((term) => term && term.trim());
    if (!content || !cleanTerms.length) {
        return content;
    }
    const regex = new RegExp(`(${cleanTerms.map((term) => escapeRegExp(term)).join('|')})`, 'gi');
    return content.split(regex).map((part, index) => {
        if (index % 2 === 1) {
            return (
                <mark className="hot-highlight" key={`${part}-${index}`}>
                    {part}
                </mark>
            );
        }
        return <span key={`${part}-${index}`}>{part}</span>;
    });
}

function Sparkline ({ values }) {
    if (!values || values.length < 2) {
        return <span className="sparkline-empty">—</span>;
    }
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const points = values
        .map((value, index) => {
            const x = (index / (values.length - 1)) * 100;
            const y = 100 - ((value - min) / range) * 100;
            return `${x},${y}`;
        })
        .join(' ');
    return (
        <svg className="sparkline" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polyline points={points} fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
        </svg>
    );
}

function HotTrendsPage () {
    const [data, setData] = useState({ items: [], platforms: {}, generatedAt: null });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [platformFilter, setPlatformFilter] = useState('all');
    const [sortKey, setSortKey] = useState('hot');
    const [autoRefresh, setAutoRefresh] = useState(true);

    const loadData = async (force = false) => {
        setLoading(true);
        setError('');
        try {
            const response = await fetch(`/api/hot${force ? '?force=1' : ''}`);
            const payload = await response.json();
            if (!response.ok || !payload.ok) {
                throw new Error(payload.error || '热点获取失败');
            }
            setData(payload);
        } catch (err) {
            setError(err.message || '热点获取失败');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        if (!autoRefresh) {
            return undefined;
        }
        const timer = setInterval(() => {
            loadData(false);
        }, 120000);
        return () => clearInterval(timer);
    }, [autoRefresh]);

    const sortedItems = useMemo(() => {
        const targetPlatform = normalizePlatform(platformFilter || '');
        const filtered = data.items.filter((item) => {
            const itemPlatform = getItemPlatform(item);
            if (targetPlatform && targetPlatform !== 'all' && itemPlatform !== targetPlatform) {
                return false;
            }
            return true;
        });

        const list = [...filtered];
        if (sortKey === 'rank') {
            list.sort((a, b) => (a.rank || 9999) - (b.rank || 9999));
        } else if (sortKey === 'platform') {
            list.sort((a, b) => getItemPlatform(a).localeCompare(getItemPlatform(b)));
        } else {
            list.sort((a, b) => (b.hot || 0) - (a.hot || 0));
        }
        return list;
    }, [data.items, platformFilter, sortKey]);

    const platformStatus = useMemo(() => {
        return Object.entries(data.platforms || {}).map(([key, value]) => ({
            key,
            ...value
        }));
    }, [data.platforms]);

    const platformCounts = useMemo(() => {
        const counts = {};
        data.items.forEach((item) => {
            const key = getItemPlatform(item);
            if (!key) {
                return;
            }
            counts[key] = (counts[key] || 0) + 1;
        });
        counts.all = data.items.length;
        return counts;
    }, [data.items]);

    return (
        <ToolPageShell title="全网实时热点" desc="聚合微博/知乎/抖音/百度/B站，支持趋势曲线与自动刷新。">
            <div className="hot-shell">
                <div className="hot-header">
                    <div className="hot-meta">
                        <div className="hot-meta-item">
                            <span className="hot-meta-label">数据更新时间</span>
                            <strong>{formatTime(data.generatedAt)}</strong>
                        </div>
                        <div className="hot-meta-item">
                            <span className="hot-meta-label">展示条目</span>
                            <strong>{sortedItems.length}</strong>
                        </div>
                        <div className="hot-meta-item">
                            <span className="hot-meta-label">总条目</span>
                            <strong>{data.items.length}</strong>
                        </div>
                    </div>
                    <div className="hot-actions">
                        <button type="button" onClick={() => loadData(true)} disabled={loading}>
                            {loading ? '刷新中...' : '立即刷新'}
                        </button>
                        <label className="check-label hot-toggle">
                            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
                            自动刷新（2 分钟）
                        </label>
                    </div>
                </div>

                <div className="hot-toolbar">
                    <div className="hot-search">
                        <select value={sortKey} onChange={(e) => setSortKey(e.target.value)}>
                            <option value="hot">按热度</option>
                            <option value="rank">按排名</option>
                            <option value="platform">按平台</option>
                        </select>
                    </div>
                    <div className="hot-platforms">
                        {PLATFORM_OPTIONS.map((option) => {
                            const count = platformCounts[option.key] || 0;
                            return (
                                <button
                                    key={option.key}
                                    type="button"
                                    className={platformFilter === option.key ? 'hot-pill active' : 'hot-pill'}
                                    onClick={() => setPlatformFilter(option.key)}
                                >
                                    {option.label}
                                    <span className="hot-pill-count">{count}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="hot-status">
                    {platformStatus.map((platform) => (
                        <div key={platform.key} className={platform.ok ? 'hot-status-item' : 'hot-status-item is-error'}>
                            <span className="hot-status-dot" />
                            <div>
                                <strong>{platform.label || platform.key}</strong>
                                <div className="hot-status-sub">
                                    {platform.ok ? `更新于 ${formatTime(platform.updatedAt)}` : platform.error || '抓取失败'}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {error ? <p className="error">{error}</p> : null}

                <div className="hot-grid">
                    {sortedItems.length ? (
                        sortedItems.map((item) => {
                            const platformKey = getItemPlatform(item);
                            const platformLabel = getPlatformLabel(platformKey, item.platformLabel);
                            return (
                                <article key={item.id} className="hot-card" data-platform={platformKey || 'unknown'}>
                                    <div className="hot-card-head">
                                        <span className="hot-platform">{platformLabel}</span>
                                        {item.rank ? <span className="hot-rank">#{item.rank}</span> : null}
                                        {item.hot ? <span className="hot-score">热度 {formatHot(item.hot)}</span> : null}
                                    </div>
                                    <a className="hot-title" href={item.url} target="_blank" rel="noreferrer">
                                        {item.title}
                                    </a>
                                    {item.summary ? <p className="hot-summary">{item.summary}</p> : null}
                                    <div className="hot-card-foot">
                                        <div className="hot-trend">
                                            <span className="hot-trend-label">趋势</span>
                                            <Sparkline values={item.trend} />
                                        </div>
                                    </div>
                                </article>
                            );
                        })
                    ) : (
                        <div className="hot-empty">没有匹配的热点内容。</div>
                    )}
                </div>
            </div>
        </ToolPageShell>
    );
}

export default HotTrendsPage;
