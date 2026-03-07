import { useState } from 'react';
import ToolPageShell from '../components/ToolPageShell';

function TextLetterPage() {
  const [sourceText, setSourceText] = useState('');
  const [resultText, setResultText] = useState('');
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const readPassword = () => {
    if (!usePassword) {
      return '';
    }
    if (!password) {
      throw new Error('已勾选使用密码，请输入密码');
    }
    if (/\s/.test(password)) {
      throw new Error('密码不允许空白字符（空格/Tab/换行）');
    }
    return password;
  };

  const callApi = async (action) => {
    const payload = {
      action,
      text: sourceText,
      usePassword,
      password: readPassword()
    };

    const res = await fetch('/api/text-letter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.error || '请求失败');
    }

    return data.output;
  };

  const runAction = async (action) => {
    setError('');
    try {
      const output = await callApi(action);
      setResultText(output);
    } catch (err) {
      setError(err.message || '请求失败');
    }
  };

  return (
    <ToolPageShell title="文本加密为字母" desc="支持可选密码，在文本与字母密文之间转换。">
      <label className="field-label" htmlFor="sourceText">
        输入内容
      </label>
      <textarea
        id="sourceText"
        placeholder="请输入明文或密文"
        rows={8}
        value={sourceText}
        onChange={(e) => setSourceText(e.target.value)}
      />

      <div className="check-row">
        <label className="check-label">
          <input
            type="checkbox"
            checked={usePassword}
            onChange={(e) => setUsePassword(e.target.checked)}
          />
          <span>使用密码</span>
        </label>
      </div>

      <div className={usePassword ? '' : 'hidden'}>
        <label className="field-label" htmlFor="password">
          密码
        </label>
        <input
          id="password"
          type="text"
          placeholder="请输入密码（支持汉字和特殊符号，不允许空白，最多64字符）"
          maxLength={64}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      <div className="actions">
        <button type="button" onClick={() => runAction('encrypt')}>
          加密
        </button>
        <button type="button" onClick={() => runAction('decrypt')}>
          解密
        </button>
        <button
          type="button"
          onClick={() => {
            setError('');
            setSourceText('');
          }}
        >
          清空
        </button>
      </div>

      <label className="field-label" htmlFor="resultText">
        结果
      </label>
      <textarea
        id="resultText"
        readOnly
        placeholder="这里显示结果"
        rows={8}
        value={resultText}
      />

      {error ? <p className="error">{error}</p> : null}
    </ToolPageShell>
  );
}

export default TextLetterPage;
