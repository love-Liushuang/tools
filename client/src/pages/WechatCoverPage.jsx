import { useState } from 'react';
import ToolPageShell from '../components/ToolPageShell';

function WechatCoverPage () {
    const [url, setUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [result, setResult] = useState(null);

    const handleFetch = async () => {
        if (!url.trim()) {
            setError('请输入微信公众号文章链接');
            return;
        }

        setLoading(true);
        setError('');
        setNotice('');
        setResult(null);

        try {
            const response = await fetch('/api/tools/getgzhtoutu', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });

            const data = await response.json();
            if (!response.ok || !data.ok) {
                throw new Error(data?.error || '获取失败，请稍后再试');
            }

            setResult(data);
        } catch (err) {
            setError(err.message || '获取失败，请稍后再试');
        } finally {
            setLoading(false);
        }
    };

    const handleCopy = async () => {
        if (!result || !result.cover) {
            return;
        }
        try {
            await navigator.clipboard.writeText(result.cover);
            setNotice('图片地址已复制到剪贴板');
            setError('');
        } catch (err) {
            setError('复制失败，请手动复制图片地址');
            setNotice('');
        }
    };

    return (
        <ToolPageShell title="微信公众号头图获取" desc="输入公众号文章链接，提取文章封面图地址并预览。">
            <div className="div-search-wrap">
                <label className="field-block">
                    <span>请输入公众号文章链接</span>
                    <div className="div-search-input-row">
                        <input
                            type="url"
                            value={url}
                            placeholder="例如：https://mp.weixin.qq.com/s/..."
                            onChange={(e) => setUrl(e.target.value)}
                        />
                        <button
                            type="button"
                            onClick={handleFetch}
                            className="primary div-search-submit"
                            disabled={loading}
                        >
                            {loading ? '获取中...' : '开始获取'}
                        </button>
                    </div>
                </label>
            </div>
            {error ? <p className="error">{error}</p> : null}
            {notice ? <p className="notice">{notice}</p> : null}
            {result ? (
                <div className="result-card" style={{ marginTop: 50, fontSize: 18, lineHeight: 1.8, }}>
                    <h2>=========== 获取结果 ===========</h2>
                    <div>
                        <strong>文章标题：</strong>
                        <span>{result.title || '未获取到标题'}</span>
                    </div>
                    {result.author ? (
                        <div>
                            <strong>公众号：</strong>
                            <span>{result.author}</span>
                        </div>
                    ) : null}
                    <div>
                        <strong>文章链接：</strong>
                        <a href={result.url} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all', }}>
                            {result.url}
                        </a>
                    </div>
                    <div className="actions" style={{ marginTop: 16, marginBottom: 16, }}>
                        <a
                            className="ghost-btn"
                            href={result.cover}
                            target="_blank"
                            rel="noreferrer"
                            style={{ fontSize: 'initial', lineHeight: 'initial', }}
                        >
                            在新标签页打开图片
                        </a>
                        <button type="button" onClick={handleCopy}>
                            复制图片地址
                        </button>
                        <a
                            className="ghost-btn"
                            href={`/api/tools/download-img?url=${encodeURIComponent(result.cover)}`}
                            style={{ fontSize: 'initial', lineHeight: 'initial', }}
                        >
                            下载图片
                        </a>
                        {result.squareCover ? (
                            <a
                                className="ghost-btn"
                                href={`/api/tools/download-img?url=${encodeURIComponent(result.squareCover)}`}
                                style={{ fontSize: 'initial', lineHeight: 'initial', }}
                            >
                                下载方图
                            </a>
                        ) : null}
                    </div>
                    {result.squareCover ? (
                        <div>
                            <div><strong>分享方图：</strong></div>
                            <img
                                src={`/api/tools/preview-img?url=${encodeURIComponent(result.squareCover)}`}
                                alt={'方图'}
                                style={{ width: 200, }}
                            />
                        </div>
                    ) : null}
                    <div>
                        <div><strong>微信公众号头图：</strong></div>
                        <img
                            src={`/api/tools/preview-img?url=${encodeURIComponent(result.cover)}`}
                            alt={result.title || '封面'}
                            style={{ maxWidth: '100%', }}
                            onError={(e) => {
                                e.target.src = result.cover; // fallback
                            }}
                        />
                    </div>
                </div>
            ) : null}
        </ToolPageShell>
    );
}

export default WechatCoverPage;
