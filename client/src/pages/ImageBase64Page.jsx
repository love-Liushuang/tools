import { useEffect, useState } from 'react';
import ToolPageShell from '../components/ToolPageShell';
import { copyText } from '../lib/tool';

const IMAGE_FORMATS = [
    { key: 'webp', label: 'WebP', mime: 'image/webp', ext: 'webp' },
    { key: 'png', label: 'PNG', mime: 'image/png', ext: 'png' }
];

const AUTO_RENDER_DELAY = 320;

function findFormatByMime (mime) {
    return IMAGE_FORMATS.find((item) => item.mime === String(mime || '').toLowerCase()) || null;
}

function prettyBytes (bytes) {
    if (!Number.isFinite(bytes)) {
        return '-';
    }
    if (bytes < 1024) {
        return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function baseName (filename) {
    return String(filename || 'base64-image').replace(/\.[^.]+$/, '') || 'base64-image';
}

function inferMimeFromFile (file) {
    const type = String(file.type || '').toLowerCase();
    if (findFormatByMime(type)) {
        return type;
    }
    if (/\.webp$/i.test(file.name)) {
        return 'image/webp';
    }
    if (/\.png$/i.test(file.name)) {
        return 'image/png';
    }
    return '';
}

function readFileAsDataUrl (file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('读取图片失败。'));
        reader.readAsDataURL(file);
    });
}

function parseDataUri (text) {
    const value = String(text || '').trim();
    const match = value.match(/^data:([^;,]+)(?:;[^,;]+)*;base64,([\s\S]*)$/i);
    if (!match) {
        return null;
    }
    return {
        mime: match[1].toLowerCase(),
        base64: normalizeBase64Payload(match[2]),
        isDataUri: true
    };
}

function normalizeBase64Payload (text) {
    const compact = String(text || '')
        .trim()
        .replace(/\s+/g, '')
        .replace(/-/g, '+')
        .replace(/_/g, '/');

    if (!compact) {
        return '';
    }

    const mod = compact.length % 4;
    if (mod === 0 || mod === 1) {
        return compact;
    }
    return `${compact}${'='.repeat(4 - mod)}`;
}

function decodeBase64Payload (payload) {
    if (!payload || payload.length % 4 === 1 || !/^[A-Za-z0-9+/]+={0,2}$/.test(payload)) {
        throw new Error('Base64 格式不正确。');
    }
    return atob(payload);
}

function inferMimeFromBinary (binary) {
    const bytes = Array.from(binary.slice(0, 12), (char) => char.charCodeAt(0));
    const isPng = bytes.length >= 8 &&
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47 &&
        bytes[4] === 0x0d &&
        bytes[5] === 0x0a &&
        bytes[6] === 0x1a &&
        bytes[7] === 0x0a;

    if (isPng) {
        return 'image/png';
    }

    const isWebp = binary.length >= 12 && binary.slice(0, 4) === 'RIFF' && binary.slice(8, 12) === 'WEBP';
    if (isWebp) {
        return 'image/webp';
    }

    return '';
}

function resolveImageMime (base64, dataUriMime = '') {
    const binary = decodeBase64Payload(base64);
    const knownMime = findFormatByMime(dataUriMime);
    if (knownMime) {
        return knownMime.mime;
    }

    const inferredMime = inferMimeFromBinary(binary);
    if (!inferredMime) {
        throw new Error('无法识别图片类型，请确认是 PNG 或 WebP 的 Base64。');
    }
    return inferredMime;
}

function buildImageSource (text) {
    const parsed = parseDataUri(text);
    if (parsed) {
        const mime = resolveImageMime(parsed.base64, parsed.mime);
        return {
            ...parsed,
            mime,
            dataUri: `data:${mime};base64,${parsed.base64}`
        };
    }

    const base64 = normalizeBase64Payload(text);
    const mime = resolveImageMime(base64);

    return {
        mime,
        base64,
        dataUri: `data:${mime};base64,${base64}`,
        isDataUri: false
    };
}

function loadImage (src) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('图片渲染失败，请确认 Base64 内容是有效图片。'));
        image.src = src;
    });
}

function canvasToBlob (canvas, format) {
    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => {
                if (!blob) {
                    reject(new Error('图片导出失败，请重试。'));
                    return;
                }
                if (format.mime === 'image/webp' && blob.type && blob.type !== format.mime) {
                    reject(new Error('当前浏览器不支持导出 WebP。'));
                    return;
                }
                resolve(blob);
            },
            format.mime,
            format.mime === 'image/webp' ? 0.92 : undefined
        );
    });
}

async function exportImage (item, format) {
    const image = await loadImage(item.dataUri);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('当前浏览器不支持 Canvas 2D。');
    }

    ctx.drawImage(image, 0, 0, width, height);
    const blob = await canvasToBlob(canvas, format);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${baseName(item.name)}.${format.ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function ImagePreview ({ item, emptyText }) {
    if (!item) {
        return <div className="image-base64-empty">{emptyText}</div>;
    }

    return (
        <div className="image-base64-preview">
            <div className="image-base64-preview-head">
                <p className="image-base64-preview-title">{item.name}</p>
                <p className="image-base64-preview-meta">
                    {item.width}x{item.height}px · {item.mime.replace('image/', '').toUpperCase()}
                </p>
            </div>
            <div className="image-base64-preview-box">
                <img src={item.dataUri} alt={item.name} />
            </div>
            <div className="image-base64-meta-row">
                <span>{item.base64.length.toLocaleString()} 字符</span>
                {Number.isFinite(item.size) ? <span>{prettyBytes(item.size)}</span> : null}
            </div>
        </div>
    );
}

function ImageBase64Page () {
    const [activeTab, setActiveTab] = useState('decode');
    const [encodeResult, setEncodeResult] = useState(null);
    const [base64Input, setBase64Input] = useState('');
    const [decodeResult, setDecodeResult] = useState(null);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [working, setWorking] = useState(false);
    const [rendering, setRendering] = useState(false);
    const outputText = encodeResult ? encodeResult.base64 : '';

    const setInfo = (text) => {
        setMessage(text || '');
        setError('');
    };

    const setProblem = (text) => {
        setError(text || '');
        setMessage('');
    };

    useEffect(() => {
        const text = base64Input.trim();
        if (!text) {
            setDecodeResult(null);
            setRendering(false);
            return undefined;
        }

        let cancelled = false;
        setRendering(true);
        const timer = window.setTimeout(async () => {
            try {
                const source = buildImageSource(text);
                const image = await loadImage(source.dataUri);
                if (cancelled) {
                    return;
                }
                setDecodeResult({
                    name: 'base64-image',
                    mime: source.mime,
                    base64: source.base64,
                    dataUri: source.dataUri,
                    width: image.naturalWidth || image.width,
                    height: image.naturalHeight || image.height
                });
                setMessage('图片已自动渲染。');
                setError('');
            } catch (err) {
                if (cancelled) {
                    return;
                }
                setDecodeResult(null);
                setError(err.message || 'Base64 转图片失败。');
                setMessage('');
            } finally {
                if (!cancelled) {
                    setRendering(false);
                }
            }
        }, AUTO_RENDER_DELAY);

        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [base64Input]);

    const handleTabChange = (tab) => {
        setActiveTab(tab);
        setMessage('');
        setError('');
    };

    const handleFileChange = async (event) => {
        const file = event.target.files && event.target.files[0];
        event.target.value = '';
        if (!file) {
            return;
        }

        const mime = inferMimeFromFile(file);
        if (!mime) {
            setProblem('请选择 PNG 或 WebP 图片。');
            setEncodeResult(null);
            return;
        }

        setWorking(true);
        try {
            const dataUrl = await readFileAsDataUrl(file);
            const parsed = parseDataUri(dataUrl);
            if (!parsed) {
                throw new Error('图片读取结果不是有效 Data URI。');
            }

            const dataUri = `data:${mime};base64,${parsed.base64}`;
            const image = await loadImage(dataUri);
            setEncodeResult({
                name: file.name,
                mime,
                base64: parsed.base64,
                dataUri,
                width: image.naturalWidth || image.width,
                height: image.naturalHeight || image.height,
                size: file.size
            });
            setInfo('图片已转换为 Base64。');
        } catch (err) {
            setEncodeResult(null);
            setProblem(err.message || '图片转 Base64 失败。');
        } finally {
            setWorking(false);
        }
    };

    const handleCopyOutput = async (text, label) => {
        const ok = await copyText(text);
        if (ok) {
            setInfo(`已复制 ${label}。`);
        } else {
            setProblem('复制失败，请检查浏览器权限。');
        }
    };

    const handleUseOutput = () => {
        if (!encodeResult) {
            setProblem('当前没有可填入的 Base64。');
            return;
        }
        setBase64Input(encodeResult.base64);
        setDecodeResult(null);
        setActiveTab('decode');
        setInfo('已填入 Base64 转图片。');
    };

    const handleDownload = async (format) => {
        if (!decodeResult) {
            setProblem('请先粘贴可识别的 Base64 图片。');
            return;
        }

        setWorking(true);
        try {
            await exportImage(decodeResult, format);
            setInfo(`已开始下载 ${format.label} 图片。`);
        } catch (err) {
            setProblem(err.message || '下载图片失败。');
        } finally {
            setWorking(false);
        }
    };

    const handleClearEncode = () => {
        setEncodeResult(null);
        setMessage('');
        setError('');
    };

    const handleClearDecode = () => {
        setBase64Input('');
        setDecodeResult(null);
        setMessage('');
        setError('');
    };

    return (
        <ToolPageShell title="图片 Base64 互转" desc="PNG/WebP 与 Base64/Data URI 互转，支持预览和 PNG/WebP 下载。">
            <div className="image-base64-shell">
                <div className="image-base64-tabs" role="tablist" aria-label="转换方向">
                    <button
                        type="button"
                        role="tab"
                        aria-selected={activeTab === 'decode'}
                        className={`image-base64-tab${activeTab === 'decode' ? ' is-active' : ''}`}
                        onClick={() => handleTabChange('decode')}
                    >
                        <strong>Base64 转图片</strong>
                        <span>粘贴后自动预览，可下载 PNG/WebP</span>
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={activeTab === 'encode'}
                        className={`image-base64-tab${activeTab === 'encode' ? ' is-active' : ''}`}
                        onClick={() => handleTabChange('encode')}
                    >
                        <strong>图片转 Base64</strong>
                        <span>上传 PNG/WebP，生成纯 Base64</span>
                    </button>
                </div>

                {activeTab === 'decode' ? (
                    <div className="image-base64-section" role="tabpanel">
                        <div className="image-base64-decode-grid">
                            <div className="image-base64-input-panel">
                                <label className="field-label" htmlFor="image-base64-input">
                                    Base64 或 Data URI
                                </label>
                                <textarea
                                    id="image-base64-input"
                                    className="mono-textarea"
                                    rows={14}
                                    value={base64Input}
                                    onChange={(event) => setBase64Input(event.target.value)}
                                    placeholder="粘贴纯 Base64，或 data:image/png;base64,... / data:image/webp;base64,..."
                                />

                                <div className="actions">
                                    {IMAGE_FORMATS.map((item) => (
                                        <button
                                            key={item.key}
                                            type="button"
                                            onClick={() => handleDownload(item)}
                                            disabled={!decodeResult || working || rendering}
                                        >
                                            下载 {item.label}
                                        </button>
                                    ))}
                                    <button type="button" onClick={handleClearDecode} disabled={working}>
                                        清空
                                    </button>
                                </div>
                                {rendering ? <p className="status-text">正在自动渲染图片...</p> : null}
                            </div>
                            <div className="image-base64-preview-panel">
                                <p className="field-label">预览</p>
                                <ImagePreview item={decodeResult} emptyText="粘贴 Base64 后自动显示图片" />
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="image-base64-section" role="tabpanel">
                        <div className="img-form-grid">
                            <label className="field-block">
                                <span>选择图片</span>
                                <input
                                    type="file"
                                    accept="image/png,image/webp,.png,.webp"
                                    onChange={handleFileChange}
                                    disabled={working}
                                />
                            </label>
                        </div>

                        <div className="image-base64-output-grid">
                            <div className='image-base64-input-panel'>
                                <label className="field-label" htmlFor="image-base64-output">
                                    Base64 输出
                                </label>
                                <textarea
                                    id="image-base64-output"
                                    className="mono-textarea"
                                    rows={10}
                                    readOnly
                                    value={outputText}
                                    placeholder="选择 PNG 或 WebP 后自动生成纯 Base64"
                                />
                                <div className="actions">
                                    <button
                                        type="button"
                                        onClick={() => handleCopyOutput(encodeResult?.base64, 'Base64')}
                                        disabled={!encodeResult || working}
                                    >
                                        复制 Base64
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleCopyOutput(encodeResult?.dataUri, 'Data URI')}
                                        disabled={!encodeResult || working}
                                    >
                                        复制 Data URI
                                    </button>
                                    <button type="button" onClick={handleUseOutput} disabled={!encodeResult || working}>
                                        转为图片
                                    </button>
                                    <button type="button" onClick={handleClearEncode} disabled={working}>
                                        清空
                                    </button>
                                </div>
                            </div>
                            <div className="image-base64-preview-panel">
                                <p className="field-label">预览</p>
                                <ImagePreview item={encodeResult} emptyText="图片预览" />
                            </div>
                        </div>
                    </div>
                )}

                {message ? <p className="status-text">{message}</p> : null}
                {error ? <p className="error">{error}</p> : null}
            </div>
        </ToolPageShell>
    );
}

export default ImageBase64Page;
