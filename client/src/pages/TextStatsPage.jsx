import { useMemo, useState } from 'react';
import ToolPageShell from '../components/ToolPageShell';

function TextStatsPage() {
  const [input, setInput] = useState('');
  const [stats, setStats] = useState({ words: 0, chars: 0, lines: 0 });
  const [error, setError] = useState('');

  const urlPreview = useMemo(() => encodeURIComponent(input), [input]);

  const calcLocalStats = (text) => {
    const trimmed = text.trim();
    return {
      words: trimmed ? trimmed.split(/\s+/).length : 0,
      chars: text.length,
      lines: text ? text.split(/\r?\n/).length : 0
    };
  };

  const handleAnalyze = async () => {
    try {
      const response = await fetch('/api/tools/text-stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: input })
      });

      if (!response.ok) {
        throw new Error('API unavailable');
      }

      const data = await response.json();
      setStats(data);
      setError('');
    } catch (e) {
      setStats(calcLocalStats(input));
      setError('后端 API 暂不可用，已切换本地统计。');
    }
  };

  return (
    <ToolPageShell title="文本统计" desc="统计字数、字符数、行数，并预览 URL 编码结果。">
      <textarea rows={12} value={input} onChange={(e) => setInput(e.target.value)} />
      <div className="actions">
        <button type="button" onClick={handleAnalyze}>
          开始统计
        </button>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <div className="stats-grid">
        <div className="stat-box">
          <p>字数</p>
          <strong>{stats.words}</strong>
        </div>
        <div className="stat-box">
          <p>字符</p>
          <strong>{stats.chars}</strong>
        </div>
        <div className="stat-box">
          <p>行数</p>
          <strong>{stats.lines}</strong>
        </div>
      </div>
      <p className="preview">URL 编码预览：{urlPreview}</p>
    </ToolPageShell>
  );
}

export default TextStatsPage;
