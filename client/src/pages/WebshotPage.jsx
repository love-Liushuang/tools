import { useEffect, useMemo, useState } from 'react';
import ToolPageShell from '../components/ToolPageShell';

const FORMAT_OPTIONS = [
    { key: 'png', label: 'PNG（高清）' },
    { key: 'pdf', label: 'PDF（分页）' }
];

const WIDTH_PRESETS = [
    { key: 390, label: '390px' },
    { key: 550, label: '550px' },
    { key: 768, label: '768px' },
    { key: 1200, label: '1200px' },
    { key: 1366, label: '1366px' },
    { key: 1440, label: '1440px' },
    { key: 1920, label: '1920px' }
];

const DEVICE_MODE_OPTIONS = [
    { key: 'auto', label: '自动' },
    { key: 'desktop', label: '桌面' },
    { key: 'mobile', label: '手机' }
];

const SCALE_OPTIONS = [
    { key: 1, label: '1x 标准' },
    { key: 2, label: '2x 高清' },
    { key: 3, label: '3x 超清' }
];

const WAIT_OPTIONS = [
    { key: 0, label: '不等待' },
    { key: 500, label: '0.5 秒' },
    { key: 1000, label: '1 秒' },
    { key: 2000, label: '2 秒' },
    { key: 4000, label: '4 秒' }
];

function formatBytes (bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) {
        return '';
    }
    if (bytes < 1024) {
        return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function parseFilename (header, fallback) {
    if (!header) {
        return fallback;
    }
    const match = header.match(/filename="?([^";]+)"?/i);
    if (match && match[1]) {
        return match[1];
    }
    return fallback;
}

function WebshotPage () {
    const [url, setUrl] = useState('');
    const [format, setFormat] = useState('png');
    const [width, setWidth] = useState(550);
    const [height, setHeight] = useState(844);
    const [deviceMode, setDeviceMode] = useState('auto');
    const [scale, setScale] = useState(3);
    const [waitMs, setWaitMs] = useState(2000);
    const [fullPage, setFullPage] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState(null);

    const selectedFormat = useMemo(
        () => FORMAT_OPTIONS.find((item) => item.key === format) || FORMAT_OPTIONS[0],
        [format]
    );

    useEffect(() => {
        return () => {
            if (result && result.previewUrl) {
                URL.revokeObjectURL(result.previewUrl);
            }
        };
    }, [result]);

    const handleSubmit = async () => {
        if (!url.trim()) {
            setError('请输入需要截图的网页地址。');
            return;
        }
        if (!/^https?:\/\//i.test(url.trim())) {
            setError('网址需要以 http:// 或 https:// 开头。');
            return;
        }

        setLoading(true);
        setError('');

        const payload = {
            url: url.trim(),
            format: selectedFormat.key,
            width,
            height,
            deviceMode,
            scale,
            waitMs,
            fullPage
        };

        try {
            const response = await fetch('/api/webshot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const contentType = response.headers.get('content-type') || '';

            if (!response.ok || contentType.includes('application/json')) {
                const data = contentType.includes('application/json') ? await response.json() : null;
                throw new Error((data && data.error) || '截图失败，请稍后再试');
            }

            const blob = await response.blob();
            const previewUrl = URL.createObjectURL(blob);
            const filename = parseFilename(
                response.headers.get('content-disposition'),
                `webshot-${Date.now()}.${selectedFormat.key}`
            );

            if (result && result.previewUrl) {
                URL.revokeObjectURL(result.previewUrl);
            }

            setResult({
                previewUrl,
                filename,
                size: blob.size,
                format: selectedFormat.key
            });
        } catch (err) {
            setError(err.message || '截图失败，请稍后再试');
        } finally {
            setLoading(false);
        }
    };

    const resetAll = () => {
        if (result && result.previewUrl) {
            URL.revokeObjectURL(result.previewUrl);
        }
        setUrl('');
        setFormat('png');
        setWidth(550);
        setHeight(844);
        setDeviceMode('auto');
        setScale(3);
        setWaitMs(2000);
        setFullPage(true);
        setError('');
        setResult(null);
    };

    return (
        <ToolPageShell
            title="在线网页整页截图"
            desc="输入网址，生成高清整页截图，支持 PNG/PDF 下载。"
        >
            <div className="webshot-shell">
                <div className="webshot-form">
                    <div>
                        <label className="field-label" htmlFor="webshot-url">
                            网页地址
                        </label>
                        <input
                            id="webshot-url"
                            type="text"
                            placeholder="https://example.com"
                            value={url}
                            onChange={(event) => setUrl(event.target.value)}
                        />
                    </div>

                    <div className="webshot-row webshot-row-primary">
                        <div className="webshot-field-wide">
                            <label className="field-label">视口宽度</label>
                            <div className="webshot-width-panel">
                                <div className="webshot-width-input">
                                    <input
                                        type="number"
                                        min="320"
                                        max="2560"
                                        step="1"
                                        value={width}
                                        onChange={(event) => setWidth(Number(event.target.value) || 320)}
                                    />
                                    <span className="webshot-width-unit">px</span>
                                </div>
                                <div className="webshot-presets" aria-label="快捷宽度">
                                    {WIDTH_PRESETS.map((option) => (
                                        <button
                                            key={option.key}
                                            type="button"
                                            className={`webshot-chip${width === option.key ? ' is-active' : ''}`}
                                            onClick={() => setWidth(option.key)}
                                        >
                                            {option.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div>
                            <label className="field-label">设备模式</label>
                            <select value={deviceMode} onChange={(event) => setDeviceMode(event.target.value)}>
                                {DEVICE_MODE_OPTIONS.map((option) => (
                                    <option key={option.key} value={option.key}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="field-label">清晰度倍率</label>
                            <select value={scale} onChange={(event) => setScale(Number(event.target.value))}>
                                {SCALE_OPTIONS.map((option) => (
                                    <option key={option.key} value={option.key}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="field-label">渲染等待</label>
                            <select value={waitMs} onChange={(event) => setWaitMs(Number(event.target.value))}>
                                {WAIT_OPTIONS.map((option) => (
                                    <option key={option.key} value={option.key}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="webshot-row webshot-row-secondary">
                        <div>
                            <label className="field-label">输出格式</label>
                            <select value={format} onChange={(event) => setFormat(event.target.value)}>
                                {FORMAT_OPTIONS.map((option) => (
                                    <option key={option.key} value={option.key}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="field-label">视口高度（预览用）</label>
                            <input
                                type="number"
                                min="600"
                                max="1440"
                                value={height}
                                onChange={(event) => setHeight(Number(event.target.value))}
                            />
                        </div>
                        <label className="check-label webshot-toggle webshot-toggle-card">
                            <input
                                type="checkbox"
                                checked={fullPage}
                                onChange={(event) => setFullPage(event.target.checked)}
                            />
                            整页截图（长度自动延伸）
                        </label>
                    </div>

                    <div className="webshot-actions">
                        <button type="button" onClick={handleSubmit} disabled={loading}>
                            {loading ? '生成中...' : '生成截图'}
                        </button>
                        <button type="button" className="btn-ghost" onClick={resetAll} disabled={loading}>
                            重置
                        </button>
                        <p className="webshot-tip">
                            视口宽度决定排版和换行；清晰度倍率只影响图片锐度，不会让文案变宽。
                        </p>
                        <p className="webshot-tip">
                            部分站点会锁定正文最大宽度，例如微信公众号桌面正文大约只有 677px，拉大截图宽度也不会无限展开。
                        </p>
                    </div>
                </div>

                {error ? <p className="error">{error}</p> : null}

                {result ? (
                    <div className="webshot-result">
                        <div className="webshot-result-head">
                            <div>
                                <strong>{result.filename}</strong>
                                <div className="webshot-meta">
                                    {result.format.toUpperCase()} · {formatBytes(result.size)}
                                </div>
                            </div>
                            <a className="btn-ghost" href={result.previewUrl} download={result.filename}>
                                下载文件
                            </a>
                        </div>
                        {result.format === 'png' ? (
                            <img className="webshot-preview" src={result.previewUrl} alt="网页截图预览" />
                        ) : (
                            <div className="webshot-pdf">
                                PDF 预览需下载后查看。
                            </div>
                        )}
                    </div>
                ) : null}

                <div className="webshot-notice">
                    <strong>说明：</strong>仅支持公开网页（无登录/验证码）。若你要模拟平板或小窗口桌面页，请把“设备模式”切到桌面，不要只调清晰度倍率。
                </div>
            </div>
        </ToolPageShell>
    );
}

export default WebshotPage;
