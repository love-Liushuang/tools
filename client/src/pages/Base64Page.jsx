import { useState } from 'react';
import ToolPageShell from '../components/ToolPageShell';

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

function Base64Page() {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');

  const handleEncode = () => {
    try {
      setOutput(toBase64(input));
      setError('');
    } catch (e) {
      setOutput('');
      setError('编码失败，请检查输入');
    }
  };

  const handleDecode = () => {
    try {
      setOutput(fromBase64(input));
      setError('');
    } catch (e) {
      setOutput('');
      setError('解码失败，请确认输入是合法 Base64');
    }
  };

  return (
    <ToolPageShell title="Base64 编解码" desc="支持 UTF-8 文本，适合中文内容转换。">
      <textarea rows={12} value={input} onChange={(e) => setInput(e.target.value)} />
      <div className="actions">
        <button type="button" onClick={handleEncode}>
          编码
        </button>
        <button type="button" onClick={handleDecode}>
          解码
        </button>
      </div>
      {error ? <p className="error">{error}</p> : <pre>{output}</pre>}
    </ToolPageShell>
  );
}

export default Base64Page;
