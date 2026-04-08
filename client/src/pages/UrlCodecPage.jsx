import { useState } from 'react';
import ToolPageShell from '../components/ToolPageShell';

const MODE_OPTIONS = [
  {
    value: 'component',
    title: '参数 / 文本',
    desc: '适合 query 参数、路径片段和任意文本，使用 encodeURIComponent / decodeURIComponent。'
  },
  {
    value: 'uri',
    title: '完整 URL',
    desc: '保留协议、域名、路径分隔符等结构，使用 encodeURI / decodeURI。'
  }
];

const EXAMPLES = [
  {
    label: '查询参数',
    mode: 'component',
    plusAsSpace: false,
    value: 'keyword=前端 工具&redirect=https://example.com/搜索?q=中文'
  },
  {
    label: '完整链接',
    mode: 'uri',
    plusAsSpace: false,
    value: 'https://example.com/search?q=中文 空格&tab=dev#section'
  },
  {
    label: '表单值',
    mode: 'component',
    plusAsSpace: true,
    value: '姓名=张三 李四&城市=上海+北京'
  }
];

function countLines(text) {
  if (!text) {
    return 0;
  }
  return String(text).split(/\r?\n/).length;
}

function encodeUrlText(text, { mode, plusAsSpace }) {
  if (mode === 'uri') {
    return encodeURI(text);
  }

  const encoded = encodeURIComponent(text);
  return plusAsSpace ? encoded.replace(/%20/g, '+') : encoded;
}

function decodeUrlText(text, { mode, plusAsSpace }) {
  if (mode === 'uri') {
    return decodeURI(text);
  }

  const normalized = plusAsSpace ? text.replace(/\+/g, '%20') : text;
  return decodeURIComponent(normalized);
}

async function copyTextToClipboard(text) {
  const content = String(text || '');
  if (!content) {
    return;
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(content);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = content;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

function UrlCodecPage() {
  const [mode, setMode] = useState('component');
  const [plusAsSpace, setPlusAsSpace] = useState(false);
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [lastAction, setLastAction] = useState('未执行');

  const activeMode = MODE_OPTIONS.find((item) => item.value === mode) || MODE_OPTIONS[0];

  const clearFeedback = () => {
    setMessage('');
    setError('');
  };

  const handleEncode = () => {
    if (!input) {
      setOutput('');
      setMessage('');
      setError('请输入要编码的内容。');
      return;
    }

    try {
      setOutput(encodeUrlText(input, { mode, plusAsSpace }));
      setLastAction('编码');
      setError('');
      setMessage('编码完成。');
    } catch (err) {
      setOutput('');
      setMessage('');
      setError('编码失败，请检查输入内容。');
    }
  };

  const handleDecode = () => {
    if (!input) {
      setOutput('');
      setMessage('');
      setError('请输入要解码的内容。');
      return;
    }

    try {
      setOutput(decodeUrlText(input, { mode, plusAsSpace }));
      setLastAction('解码');
      setError('');
      setMessage('解码完成。');
    } catch (err) {
      setOutput('');
      setMessage('');
      setError('解码失败，请确认输入是合法的 URL 编码内容。');
    }
  };

  const handleSwap = () => {
    setInput(output);
    setOutput(input);
    setLastAction('交换');
    setMessage('已交换输入和输出。');
    setError('');
  };

  const handleUseOutput = () => {
    if (!output) {
      setMessage('');
      setError('当前没有可回填的结果。');
      return;
    }

    setInput(output);
    setMessage('结果已回填到输入区。');
    setError('');
  };

  const handleCopy = async () => {
    if (!output) {
      setMessage('');
      setError('当前没有可复制的结果。');
      return;
    }

    try {
      await copyTextToClipboard(output);
      setMessage('结果已复制到剪贴板。');
      setError('');
    } catch (err) {
      setMessage('');
      setError('复制失败，请检查浏览器权限。');
    }
  };

  const handleClear = () => {
    setInput('');
    setOutput('');
    setLastAction('未执行');
    clearFeedback();
  };

  const applyExample = (example) => {
    setMode(example.mode);
    setPlusAsSpace(example.plusAsSpace);
    setInput(example.value);
    setOutput('');
    setLastAction('未执行');
    clearFeedback();
  };

  return (
    <ToolPageShell
      title="URL 编码 / 解码"
      desc="合并 URL Encode / Decode，支持完整 URL、参数文本，以及表单场景的空格与 + 互转。"
    >
      <div className="urlcodec-shell">
        <div className="urlcodec-mode-row">
          {MODE_OPTIONS.map((item) => (
            <button
              key={item.value}
              type="button"
              className={`urlcodec-mode-btn${mode === item.value ? ' is-active' : ''}`}
              onClick={() => {
                setMode(item.value);
                clearFeedback();
              }}
            >
              <strong>{item.title}</strong>
              <span>{item.desc}</span>
            </button>
          ))}
        </div>

        <div className="urlcodec-toolbar">
          <div className="urlcodec-chip-row">
            {EXAMPLES.map((example) => (
              <button
                key={example.label}
                type="button"
                className="btn-ghost urlcodec-chip"
                onClick={() => applyExample(example)}
              >
                示例：{example.label}
              </button>
            ))}
          </div>

          <label className="check-label">
            <input
              type="checkbox"
              checked={plusAsSpace}
              disabled={mode !== 'component'}
              onChange={(event) => {
                setPlusAsSpace(event.target.checked);
                clearFeedback();
              }}
            />
            表单模式：空格与 <code>+</code> 互转
          </label>
        </div>

        <div className="urlcodec-grid">
          <section className="urlcodec-panel">
            <div className="urlcodec-panel-head">
              <div>
                <h2 className="urlcodec-panel-title">输入区</h2>
                <p className="urlcodec-panel-meta">粘贴原始文本、参数串或完整 URL</p>
              </div>
              <span className="urlcodec-panel-tag">{activeMode.title}</span>
            </div>
            <textarea
              className="mono-textarea urlcodec-textarea"
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
                clearFeedback();
              }}
              placeholder={mode === 'uri' ? 'https://example.com/search?q=中文 空格' : 'name=张三&city=上海 北京'}
            />
          </section>

          <section className="urlcodec-panel">
            <div className="urlcodec-panel-head">
              <div>
                <h2 className="urlcodec-panel-title">结果区</h2>
                <p className="urlcodec-panel-meta">编码或解码结果会显示在这里</p>
              </div>
              <span className="urlcodec-panel-tag">{lastAction}</span>
            </div>
            <textarea
              className="mono-textarea urlcodec-textarea"
              value={output}
              readOnly
              placeholder="执行编码或解码后显示结果"
            />
          </section>
        </div>

        <div className="actions">
          <button type="button" onClick={handleEncode}>
            编码
          </button>
          <button type="button" onClick={handleDecode}>
            解码
          </button>
          <button type="button" className="btn-ghost" onClick={handleSwap}>
            交换输入输出
          </button>
          <button type="button" className="btn-ghost" onClick={handleUseOutput}>
            结果回填输入
          </button>
          <button type="button" className="btn-ghost" onClick={handleCopy}>
            复制结果
          </button>
          <button type="button" className="btn-ghost" onClick={handleClear}>
            清空
          </button>
        </div>

        {error ? <p className="error">{error}</p> : null}
        {message ? <p className="tool-message">{message}</p> : null}

        <div className="stats-grid">
          <div className="stat-box">
            <p>输入字符</p>
            <strong>{input.length}</strong>
          </div>
          <div className="stat-box">
            <p>结果字符</p>
            <strong>{output.length}</strong>
          </div>
          <div className="stat-box">
            <p>输入行数</p>
            <strong>{countLines(input)}</strong>
          </div>
          <div className="stat-box">
            <p>当前模式</p>
            <strong>{mode === 'uri' ? 'URL' : '参数'}</strong>
          </div>
        </div>

        <div className="urlcodec-note-list">
          <p>
            <strong>参数 / 文本</strong> 模式适合编码单个值或查询参数，保留最少字符，默认行为更接近常见
            <code>urlencode/urldecode</code> 工具。
          </p>
          <p>
            <strong>完整 URL</strong> 模式会保留 <code>:</code>、<code>/</code>、<code>?</code>、<code>&</code>{' '}
            等结构字符，适合整条链接。
          </p>
          <p>开启表单模式后，编码时空格会转成 <code>+</code>，解码时 <code>+</code> 会还原为空格。</p>
        </div>
      </div>
    </ToolPageShell>
  );
}

export default UrlCodecPage;
