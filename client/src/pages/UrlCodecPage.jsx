import { useMemo, useState } from 'react';
import ToolPageShell from '../components/ToolPageShell';

const CODEC_OPTIONS = [
  {
    value: 'url',
    title: 'URL',
    desc: '适合链接、参数和值的 URL 编码与解码。'
  },
  {
    value: 'base64',
    title: 'Base64',
    desc: '适合 UTF-8 文本和中文内容的 Base64 转换。'
  }
];

const URL_MODE_OPTIONS = [
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

const EXAMPLES = {
  url: [
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
  ],
  base64: [
    {
      label: '中文文本',
      value: '你好，工具站！'
    },
    {
      label: 'JSON 字符串',
      value: '{"name":"toolbox","lang":"zh-CN","enabled":true}'
    },
    {
      label: 'URL 文本',
      value: 'https://example.com/search?q=中文 空格&tab=dev'
    }
  ]
};

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

function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function fromBase64(base64Text) {
  const binary = atob(base64Text);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
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

function getActiveModeLabel(codecType, mode) {
  if (codecType === 'base64') {
    return 'Base64';
  }

  return mode === 'uri' ? '完整 URL' : '参数 / 文本';
}

function getInputPlaceholder(codecType, mode) {
  if (codecType === 'base64') {
    return '请输入要进行 Base64 编码或解码的文本';
  }

  return mode === 'uri' ? 'https://example.com/search?q=中文 空格' : 'name=张三&city=上海 北京';
}

function getInputMeta(codecType) {
  if (codecType === 'base64') {
    return '粘贴原始文本或 Base64 字符串';
  }

  return '粘贴原始文本、参数串或完整 URL';
}

function UrlCodecPage({ initialCodec = 'url' }) {
  const [codecType, setCodecType] = useState(initialCodec === 'base64' ? 'base64' : 'url');
  const [mode, setMode] = useState('component');
  const [plusAsSpace, setPlusAsSpace] = useState(false);
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [lastAction, setLastAction] = useState('未执行');

  const activeMode = URL_MODE_OPTIONS.find((item) => item.value === mode) || URL_MODE_OPTIONS[0];
  const activeCodec = CODEC_OPTIONS.find((item) => item.value === codecType) || CODEC_OPTIONS[0];
  const activeExamples = EXAMPLES[codecType] || [];
  const activeModeLabel = getActiveModeLabel(codecType, mode);

  const notes = useMemo(() => {
    if (codecType === 'base64') {
      return [
        'Base64 模式支持 UTF-8 文本，中文、Emoji 和 JSON 字符串都可以直接编码解码。',
        '如果输入不是合法 Base64，解码时会直接提示失败，避免产生误导结果。',
        'SVG 转 Base64、Data URI 预览这类场景仍建议使用独立的 SVG 转 Base64 工具。'
      ];
    }

    return [
      '参数 / 文本 模式适合编码单个值或查询参数，默认行为更接近常见 urlencode/urldecode 工具。',
      '完整 URL 模式会保留 :、/、?、& 等结构字符，适合整条链接。',
      '开启表单模式后，编码时空格会转成 +，解码时 + 会还原为空格。'
    ];
  }, [codecType]);

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
      const result = codecType === 'base64'
        ? toBase64(input)
        : encodeUrlText(input, { mode, plusAsSpace });

      setOutput(result);
      setLastAction('编码');
      setError('');
      setMessage('编码完成。');
    } catch (err) {
      setOutput('');
      setMessage('');
      setError(codecType === 'base64' ? '编码失败，请检查输入。' : '编码失败，请检查输入内容。');
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
      const result = codecType === 'base64'
        ? fromBase64(input)
        : decodeUrlText(input, { mode, plusAsSpace });

      setOutput(result);
      setLastAction('解码');
      setError('');
      setMessage('解码完成。');
    } catch (err) {
      setOutput('');
      setMessage('');
      setError(codecType === 'base64' ? '解码失败，请确认输入是合法 Base64。' : '解码失败，请确认输入是合法的 URL 编码内容。');
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
    if (codecType === 'url') {
      setMode(example.mode || 'component');
      setPlusAsSpace(Boolean(example.plusAsSpace));
    }

    setInput(example.value);
    setOutput('');
    setLastAction('未执行');
    clearFeedback();
  };

  return (
    <ToolPageShell
      title="编码 / 解码工具"
      desc="统一提供 URL 与 Base64 编解码，保留轻量输入输出、示例、复制与回填能力。"
    >
      <div className="urlcodec-shell">
        <div className="urlcodec-section">
          <p className="urlcodec-section-label">编码类型</p>
          <div className="urlcodec-mode-row">
            {CODEC_OPTIONS.map((item) => (
              <button
                key={item.value}
                type="button"
                className={`urlcodec-mode-btn${codecType === item.value ? ' is-active' : ''}`}
                onClick={() => {
                  setCodecType(item.value);
                  clearFeedback();
                }}
              >
                <strong>{item.title}</strong>
                <span>{item.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {codecType === 'url' ? (
          <div className="urlcodec-section">
            <p className="urlcodec-section-label">URL 处理方式</p>
            <div className="urlcodec-mode-row">
              {URL_MODE_OPTIONS.map((item) => (
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
          </div>
        ) : null}

        <div className="urlcodec-toolbar">
          <div className="urlcodec-chip-row">
            {activeExamples.map((example) => (
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

          {codecType === 'url' ? (
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
          ) : null}
        </div>

        <div className="urlcodec-grid">
          <section className="urlcodec-panel">
            <div className="urlcodec-panel-head">
              <div>
                <h2 className="urlcodec-panel-title">输入区</h2>
                <p className="urlcodec-panel-meta">{getInputMeta(codecType)}</p>
              </div>
              <span className="urlcodec-panel-tag">{activeCodec.title}</span>
            </div>
            <textarea
              className="mono-textarea urlcodec-textarea"
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
                clearFeedback();
              }}
              placeholder={getInputPlaceholder(codecType, mode)}
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
            <strong>{activeModeLabel}</strong>
          </div>
        </div>

        <div className="urlcodec-note-list">
          {notes.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </div>
      </div>
    </ToolPageShell>
  );
}

export default UrlCodecPage;
