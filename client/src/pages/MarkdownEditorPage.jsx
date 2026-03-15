import { useEffect, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import ToolPageShell from '../components/ToolPageShell';

marked.setOptions({
  gfm: true,
  breaks: true,
  headerIds: true,
  mangle: false
});

const STORAGE_KEY = 'toolbox-markdown-editor';
const DEFAULT_MARKDOWN = `# Markdown 在线编辑器

支持 **加粗**、*斜体*、\`行内代码\`、列表、表格等。

## 示例
- 支持实时预览
- 支持导入导出

\`\`\`js
console.log('Hello Markdown');
\`\`\`

> 提示：所有内容仅在本地浏览器中处理。
`;

function downloadText(filename, text, mime) {
  const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function MarkdownEditorPage() {
  const [markdown, setMarkdown] = useState(DEFAULT_MARKDOWN);
  const [viewMode, setViewMode] = useState('split');
  const [message, setMessage] = useState('');
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const cached = window.localStorage.getItem(STORAGE_KEY);
    if (cached) {
      setMarkdown(cached);
    }
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      window.localStorage.setItem(STORAGE_KEY, markdown);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [markdown]);

  const previewHtml = useMemo(() => {
    const raw = marked.parse(markdown || '');
    return DOMPurify.sanitize(raw);
  }, [markdown]);

  const stats = useMemo(() => {
    const text = markdown || '';
    const lines = text ? text.split('\n').length : 0;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    return {
      lines,
      words,
      chars: text.length
    };
  }, [markdown]);

  const focusTextarea = (start, end) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    textarea.focus();
    if (typeof start === 'number' && typeof end === 'number') {
      textarea.setSelectionRange(start, end);
    }
  };

  const applyWrap = (prefix, suffix, placeholder) => {
    const textarea = textareaRef.current;
    const value = markdown;
    if (!textarea) {
      setMarkdown(`${value}${prefix}${placeholder}${suffix}`);
      return;
    }
    const start = textarea.selectionStart ?? value.length;
    const end = textarea.selectionEnd ?? value.length;
    const selected = value.slice(start, end) || placeholder;
    const nextValue = value.slice(0, start) + prefix + selected + suffix + value.slice(end);
    setMarkdown(nextValue);
    window.requestAnimationFrame(() => {
      const cursorStart = start + prefix.length;
      const cursorEnd = cursorStart + selected.length;
      focusTextarea(cursorStart, cursorEnd);
    });
  };

  const insertBlock = (snippet) => {
    const textarea = textareaRef.current;
    const value = markdown;
    if (!textarea) {
      setMarkdown(`${value}\n${snippet}\n`);
      return;
    }
    const start = textarea.selectionStart ?? value.length;
    const end = textarea.selectionEnd ?? value.length;
    const prefix = start > 0 && value[start - 1] !== '\n' ? '\n' : '';
    const suffix = value[end] && value[end] !== '\n' ? '\n' : '';
    const nextValue = value.slice(0, start) + prefix + snippet + suffix + value.slice(end);
    setMarkdown(nextValue);
    window.requestAnimationFrame(() => {
      const cursor = start + prefix.length + snippet.length;
      focusTextarea(cursor, cursor);
    });
  };

  const handleImport = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) {
      return;
    }
    try {
      const text = await file.text();
      setMarkdown(text);
      setMessage(`已导入 ${file.name}`);
    } catch (err) {
      setMessage('导入失败，请检查文件内容。');
    } finally {
      event.target.value = '';
    }
  };

  const handleExportMarkdown = () => {
    downloadText('document.md', markdown || '', 'text/markdown;charset=utf-8');
  };

  const handleExportHtml = () => {
    const htmlDoc = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>Markdown 导出</title>
  <style>
    body { font-family: "PingFang SC","Microsoft YaHei",sans-serif; color: #19304a; padding: 24px; }
    h1, h2, h3 { margin-top: 1.2em; }
    pre { background: #f4f8fe; padding: 12px; border-radius: 8px; overflow: auto; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
    blockquote { margin: 12px 0; padding: 10px 14px; border-left: 3px solid #1c78dc; background: #f6fbff; color: #4b6480; }
    table { border-collapse: collapse; width: 100%; margin: 12px 0; }
    th, td { border: 1px solid #dbe8f5; padding: 8px 10px; text-align: left; }
    th { background: #f4f9ff; }
  </style>
</head>
<body>
${previewHtml}
</body>
</html>`;
    downloadText('document.html', htmlDoc, 'text/html;charset=utf-8');
  };

  const showEditor = viewMode !== 'preview';
  const showPreview = viewMode !== 'edit';

  return (
    <ToolPageShell title="Markdown 在线编辑器" desc="专业级编辑体验：实时预览、导入导出、常用语法工具栏。">
      <div className="markdown-shell">
        <div className="markdown-toolbar">
          <div className="toolbar-group">
            <span className="toolbar-title">语法</span>
            <button type="button" className="toolbar-btn" onClick={() => applyWrap('**', '**', '加粗文本')}>
              加粗
            </button>
            <button type="button" className="toolbar-btn" onClick={() => applyWrap('*', '*', '斜体文本')}>
              斜体
            </button>
            <button type="button" className="toolbar-btn" onClick={() => applyWrap('`', '`', '行内代码')}>
              行内代码
            </button>
            <button type="button" className="toolbar-btn" onClick={() => insertBlock('# 标题')}>
              标题
            </button>
            <button type="button" className="toolbar-btn" onClick={() => insertBlock('> 引用内容')}>
              引用
            </button>
            <button type="button" className="toolbar-btn" onClick={() => insertBlock('- 列表项\n- 列表项')}>
              无序列表
            </button>
            <button type="button" className="toolbar-btn" onClick={() => insertBlock('1. 列表项\n2. 列表项')}>
              有序列表
            </button>
            <button
              type="button"
              className="toolbar-btn"
              onClick={() => applyWrap('[', '](https://example.com)', '链接文本')}
            >
              链接
            </button>
            <button
              type="button"
              className="toolbar-btn"
              onClick={() => applyWrap('![', '](https://example.com/image.png)', '图片描述')}
            >
              图片
            </button>
            <button
              type="button"
              className="toolbar-btn"
              onClick={() => insertBlock('```\n代码块\n```')}
            >
              代码块
            </button>
            <button
              type="button"
              className="toolbar-btn"
              onClick={() => insertBlock('| 表头1 | 表头2 |\n| --- | --- |\n| 内容1 | 内容2 |')}
            >
              表格
            </button>
          </div>

          <div className="toolbar-group">
            <span className="toolbar-title">文件</span>
            <button type="button" className="toolbar-btn" onClick={handleImport}>
              导入
            </button>
            <button type="button" className="toolbar-btn" onClick={handleExportMarkdown}>
              导出 MD
            </button>
            <button type="button" className="toolbar-btn" onClick={handleExportHtml}>
              导出 HTML
            </button>
            <button
              type="button"
              className="toolbar-btn"
              onClick={() => {
                setMarkdown('');
                setMessage('已清空内容。');
              }}
            >
              清空
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.markdown,.txt"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          <div className="toolbar-group">
            <span className="toolbar-title">视图</span>
            <button
              type="button"
              className={viewMode === 'edit' ? 'toolbar-btn is-active' : 'toolbar-btn'}
              onClick={() => setViewMode('edit')}
            >
              仅编辑
            </button>
            <button
              type="button"
              className={viewMode === 'split' ? 'toolbar-btn is-active' : 'toolbar-btn'}
              onClick={() => setViewMode('split')}
            >
              分屏
            </button>
            <button
              type="button"
              className={viewMode === 'preview' ? 'toolbar-btn is-active' : 'toolbar-btn'}
              onClick={() => setViewMode('preview')}
            >
              仅预览
            </button>
          </div>
        </div>

        <div className="stats-grid markdown-stats">
          <div className="stat-box">
            <p>行数</p>
            <strong>{stats.lines}</strong>
          </div>
          <div className="stat-box">
            <p>单词</p>
            <strong>{stats.words}</strong>
          </div>
          <div className="stat-box">
            <p>字符</p>
            <strong>{stats.chars}</strong>
          </div>
        </div>

        {message ? <p className="tool-message">{message}</p> : null}

        <div className="markdown-grid">
          {showEditor ? (
            <section className="markdown-panel">
              <div className="markdown-panel-header">
                <h3 className="markdown-panel-title">编辑</h3>
                <span className="markdown-panel-meta">支持 Markdown 语法</span>
              </div>
              <textarea
                ref={textareaRef}
                className="markdown-editor"
                value={markdown}
                onChange={(event) => setMarkdown(event.target.value)}
                placeholder="在这里输入 Markdown..."
              />
            </section>
          ) : null}

          {showPreview ? (
            <section className="markdown-panel">
              <div className="markdown-panel-header">
                <h3 className="markdown-panel-title">预览</h3>
                <span className="markdown-panel-meta">实时渲染</span>
              </div>
              <div className="markdown-preview" dangerouslySetInnerHTML={{ __html: previewHtml }} />
            </section>
          ) : null}
        </div>
      </div>
    </ToolPageShell>
  );
}

export default MarkdownEditorPage;
