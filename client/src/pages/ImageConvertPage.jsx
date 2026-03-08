import { useEffect, useMemo, useRef, useState } from 'react';
import ToolPageShell from '../components/ToolPageShell';

const FORMAT_OPTIONS = [
    { key: 'webp', label: 'WebP', mime: 'image/webp', ext: 'webp' },
    { key: 'png', label: 'PNG', mime: 'image/png', ext: 'png' },
    { key: 'jpg', label: 'JPG', mime: 'image/jpeg', ext: 'jpg' }
];

const MAX_CONCURRENCY = 8;

function clampQuality (value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return 100;
    }
    return Math.min(100, Math.max(1, Math.round(parsed)));
}

function normalizeConcurrency (value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return 2;
    }
    return Math.min(MAX_CONCURRENCY, Math.max(1, Math.round(parsed)));
}

function normalizeMaxSize (value) {
    const text = String(value || '').trim();
    if (!text) {
        return null;
    }
    const parsed = Number(text);
    if (!Number.isFinite(parsed)) {
        return null;
    }
    if (parsed <= 0) {
        return null;
    }
    return Math.round(parsed);
}

function baseName (filename) {
    return filename.replace(/\.[^.]+$/, '');
}

function fitSize (sourceWidth, sourceHeight, maxWidth, maxHeight) {
    const safeMaxWidth = maxWidth || sourceWidth;
    const safeMaxHeight = maxHeight || sourceHeight;
    const scale = Math.min(1, safeMaxWidth / sourceWidth, safeMaxHeight / sourceHeight);
    return {
        width: Math.max(1, Math.round(sourceWidth * scale)),
        height: Math.max(1, Math.round(sourceHeight * scale))
    };
}

function loadImage (file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const image = new Image();
        image.onload = () => {
            resolve({ image, url, width: image.naturalWidth, height: image.naturalHeight });
        };
        image.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error(`无法读取图片：${file.name}`));
        };
        image.src = url;
    });
}

function canvasToBlob (canvas, mime, quality) {
    return new Promise((resolve, reject) => {
        const useQuality = mime === 'image/png' ? undefined : quality / 100;
        canvas.toBlob(
            (blob) => {
                if (!blob) {
                    reject(new Error('转换失败，请重试'));
                    return;
                }
                resolve(blob);
            },
            mime,
            useQuality
        );
    });
}

async function convertOne (file, format, quality, maxWidth, maxHeight) {
    const { image, url, width: originalWidth, height: originalHeight } = await loadImage(file);
    try {
        const target = fitSize(originalWidth, originalHeight, maxWidth, maxHeight);
        const canvas = document.createElement('canvas');
        canvas.width = target.width;
        canvas.height = target.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('当前浏览器不支持 Canvas 2D');
        }

        ctx.drawImage(image, 0, 0, target.width, target.height);
        const blob = await canvasToBlob(canvas, format.mime, quality);
        const outputName = `${baseName(file.name)}.${format.ext}`;
        const outputUrl = URL.createObjectURL(blob);

        return {
            id: `${file.name}-${file.lastModified}-${Date.now()}`,
            sourceName: file.name,
            outputName,
            outputUrl,
            originalWidth,
            originalHeight,
            targetWidth: target.width,
            targetHeight: target.height,
            outputSize: blob.size,
            format: format.label
        };
    } finally {
        URL.revokeObjectURL(url);
    }
}

async function runWithConcurrency (tasks, concurrency, onProgress) {
    const results = new Array(tasks.length);
    let cursor = 0;
    let completed = 0;

    async function worker () {
        while (true) {
            const current = cursor;
            cursor += 1;
            if (current >= tasks.length) {
                return;
            }
            results[current] = await tasks[current]();
            completed += 1;
            onProgress(completed, tasks.length);
        }
    }

    const workerCount = Math.min(concurrency, tasks.length);
    const workers = Array.from({ length: workerCount }, () => worker());
    await Promise.all(workers);
    return results;
}

function prettyBytes (bytes) {
    if (bytes < 1024) {
        return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function ImageConvertPage () {
    const [files, setFiles] = useState([]);
    const [formatKey, setFormatKey] = useState('webp');
    const [quality, setQuality] = useState(100);
    const [maxWidth, setMaxWidth] = useState('');
    const [maxHeight, setMaxHeight] = useState('');
    const [threads, setThreads] = useState(2);
    const [scrollFollow, setScrollFollow] = useState(true);
    const [converting, setConverting] = useState(false);
    const [progressText, setProgressText] = useState('');
    const [error, setError] = useState('');
    const [results, setResults] = useState([]);
    const resultEndRef = useRef(null);

    const selectedFormat = useMemo(
        () => FORMAT_OPTIONS.find((item) => item.key === formatKey) || FORMAT_OPTIONS[0],
        [formatKey]
    );

    useEffect(() => {
        return () => {
            results.forEach((item) => {
                URL.revokeObjectURL(item.outputUrl);
            });
        };
    }, [results]);

    useEffect(() => {
        if (!scrollFollow || !resultEndRef.current) {
            return;
        }
        resultEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, [results, progressText, scrollFollow]);

    const handleFileChange = (event) => {
        const list = Array.from(event.target.files || []);
        setFiles(list);
        setError('');
    };

    const clearAll = () => {
        results.forEach((item) => {
            URL.revokeObjectURL(item.outputUrl);
        });
        setFiles([]);
        setResults([]);
        setProgressText('');
        setError('');
    };

    const handleConvert = async () => {
        if (!files.length) {
            setError('请先选择至少一张图片。');
            return;
        }

        setConverting(true);
        setError('');
        setProgressText(`开始转换，共 ${files.length} 张...`);

        const safeQuality = clampQuality(quality);
        const safeThreads = normalizeConcurrency(threads);
        const safeMaxWidth = normalizeMaxSize(maxWidth);
        const safeMaxHeight = normalizeMaxSize(maxHeight);

        const nextResults = [];
        try {
            const tasks = files.map((file) => async () =>
                convertOne(file, selectedFormat, safeQuality, safeMaxWidth, safeMaxHeight)
            );

            await runWithConcurrency(tasks, safeThreads, (done, total) => {
                setProgressText(`转换中：${done}/${total}`);
            }).then((items) => {
                nextResults.push(...items);
            });

            setResults((prev) => {
                prev.forEach((item) => URL.revokeObjectURL(item.outputUrl));
                return nextResults;
            });
            setProgressText(`转换完成：${nextResults.length}/${files.length}`);
        } catch (err) {
            nextResults.forEach((item) => URL.revokeObjectURL(item.outputUrl));
            setError(err.message || '转换失败，请稍后重试。');
            setProgressText('');
        } finally {
            setConverting(false);
        }
    };

    return (
        <ToolPageShell title="在线图片转换" desc="支持批量图片格式转换、质量调整、尺寸限制和并发线程控制。">
            <div className="img-form-grid">
                <label className="field-block">
                    <span>选择图片（可多选）</span>
                    <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleFileChange}
                        disabled={converting}
                    />
                </label>

                <label className="field-block">
                    <span>转换率（1-100）</span>
                    <input
                        type="number"
                        min={1}
                        max={100}
                        value={quality}
                        onChange={(event) => setQuality(clampQuality(event.target.value))}
                        disabled={converting}
                    />
                </label>

                <label className="field-block">
                    <span>最大输出宽度（px）</span>
                    <input
                        type="number"
                        min={1}
                        placeholder="默认原始宽度"
                        value={maxWidth}
                        onChange={(event) => setMaxWidth(event.target.value)}
                        disabled={converting}
                    />
                </label>

                <label className="field-block">
                    <span>最大输出高度（px）</span>
                    <input
                        type="number"
                        min={1}
                        placeholder="默认原始高度"
                        value={maxHeight}
                        onChange={(event) => setMaxHeight(event.target.value)}
                        disabled={converting}
                    />
                </label>

                <label className="field-block">
                    <span>输出格式</span>
                    <select value={formatKey} onChange={(event) => setFormatKey(event.target.value)} disabled={converting}>
                        {FORMAT_OPTIONS.map((item) => (
                            <option key={item.key} value={item.key}>
                                {item.label}
                            </option>
                        ))}
                    </select>
                </label>

                <label className="field-block">
                    <span>线程数（1-8）</span>
                    <input
                        type="number"
                        min={1}
                        max={MAX_CONCURRENCY}
                        value={threads}
                        onChange={(event) => setThreads(normalizeConcurrency(event.target.value))}
                        disabled={converting}
                    />
                </label>
            </div>

            <div className="check-row">
                <label className="check-label">
                    <input
                        type="checkbox"
                        checked={scrollFollow}
                        onChange={(event) => setScrollFollow(event.target.checked)}
                        disabled={converting}
                    />
                    <span>滚动跟随</span>
                </label>
            </div>

            <div className="actions">
                <button type="button" onClick={handleConvert} disabled={converting}>
                    {converting ? '转换中...' : '开始转换'}
                </button>
                <button type="button" onClick={clearAll} disabled={converting}>
                    清空
                </button>
            </div>

            {progressText ? <p className="status-text">{progressText}</p> : null}
            {error ? <p className="error">{error}</p> : null}

            {files.length ? (
                <p className="file-summary">
                    已选择 {files.length} 张，输出格式：{selectedFormat.label}，质量：{clampQuality(quality)}，线程：{normalizeConcurrency(threads)}
                </p>
            ) : null}

            {results.length ? (
                <div className="result-list">
                    {results.map((item) => (
                        <div className="result-item" key={item.id}>
                            <h4>{item.outputName}</h4>
                            <p>
                                原图：{item.originalWidth}x{item.originalHeight}px，输出：{item.targetWidth}x{item.targetHeight}px
                            </p>
                            <p>
                                格式：{item.format}，大小：{prettyBytes(item.outputSize)}
                            </p>
                            <a href={item.outputUrl} download={item.outputName}>
                                下载
                            </a>
                        </div>
                    ))}
                    <div ref={resultEndRef} />
                </div>
            ) : null}
        </ToolPageShell>
    );
}

export default ImageConvertPage;
