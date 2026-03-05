import { useState } from 'react';
import ToolPageShell from '../components/ToolPageShell';

function JsonFormatterPage() {
  const [input, setInput] = useState('{\n  "name": "box-tools"\n}');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');

  const formatJson = () => {
    try {
      const parsed = JSON.parse(input);
      setOutput(JSON.stringify(parsed, null, 2));
      setError('');
    } catch (e) {
      setOutput('');
      setError(e.message);
    }
  };

  const minifyJson = () => {
    try {
      const parsed = JSON.parse(input);
      setOutput(JSON.stringify(parsed));
      setError('');
    } catch (e) {
      setOutput('');
      setError(e.message);
    }
  };

  return (
    <ToolPageShell title="JSON 格式化" desc="粘贴 JSON 后一键格式化或压缩。">
      <textarea rows={12} value={input} onChange={(e) => setInput(e.target.value)} />
      <div className="actions">
        <button type="button" onClick={formatJson}>
          格式化
        </button>
        <button type="button" onClick={minifyJson}>
          压缩
        </button>
      </div>
      {error ? <p className="error">解析失败: {error}</p> : <pre>{output}</pre>}
    </ToolPageShell>
  );
}

export default JsonFormatterPage;
