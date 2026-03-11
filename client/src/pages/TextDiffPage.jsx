import { useMemo, useState } from 'react';
import ToolPageShell from '../components/ToolPageShell';

function splitLines(text) {
  const normalized = String(text || '').replace(/\r/g, '');
  if (!normalized) {
    return [];
  }
  return normalized.split('\n');
}

function normalizeLine(line, { ignoreCase, ignoreWhitespace }) {
  let value = String(line);
  if (ignoreCase) {
    value = value.toLowerCase();
  }
  if (ignoreWhitespace) {
    value = value.replace(/\s+/g, ' ').trim();
  }
  return value;
}

function myersDiffOps(a, b) {
  const n = a.length;
  const m = b.length;
  if (n === 0 && m === 0) {
    return [];
  }
  const max = n + m;
  const offset = max;
  const trace = [];

  let v = new Array(2 * max + 1).fill(0);

  for (let d = 0; d <= max; d += 1) {
    const vNext = new Array(2 * max + 1).fill(0);

    for (let k = -d; k <= d; k += 2) {
      const kIndex = offset + k;

      let x;
      if (k === -d || (k !== d && v[kIndex - 1] < v[kIndex + 1])) {
        x = v[kIndex + 1];
      } else {
        x = v[kIndex - 1] + 1;
      }

      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x += 1;
        y += 1;
      }

      vNext[kIndex] = x;

      if (x === n && y === m) {
        trace.push(vNext);
        return backtrackMyers(trace, a, b, offset);
      }
    }

    trace.push(vNext);
    v = vNext;
  }

  return [];
}

function backtrackMyers(trace, a, b, offset) {
  let x = a.length;
  let y = b.length;
  const ops = [];

  for (let d = trace.length - 1; d > 0; d -= 1) {
    const vPrev = trace[d - 1];
    const k = x - y;
    const kIndex = offset + k;

    let prevK;
    if (k === -d || (k !== d && vPrev[kIndex - 1] < vPrev[kIndex + 1])) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }

    const prevX = vPrev[offset + prevK];
    const prevY = prevX - prevK;

    while (x > prevX && y > prevY) {
      ops.push({ type: 'equal', aIndex: x - 1, bIndex: y - 1 });
      x -= 1;
      y -= 1;
    }

    if (x === prevX) {
      ops.push({ type: 'insert', bIndex: y - 1 });
      y -= 1;
    } else {
      ops.push({ type: 'delete', aIndex: x - 1 });
      x -= 1;
    }
  }

  while (x > 0 && y > 0) {
    ops.push({ type: 'equal', aIndex: x - 1, bIndex: y - 1 });
    x -= 1;
    y -= 1;
  }

  while (x > 0) {
    ops.push({ type: 'delete', aIndex: x - 1 });
    x -= 1;
  }

  while (y > 0) {
    ops.push({ type: 'insert', bIndex: y - 1 });
    y -= 1;
  }

  ops.reverse();
  return ops;
}

function buildDiffRows(ops, leftLines, rightLines) {
  const rows = [];
  let leftLineNo = 1;
  let rightLineNo = 1;

  const pushRow = (kind, leftText, rightText) => {
    const hasLeft = typeof leftText === 'string';
    const hasRight = typeof rightText === 'string';
    rows.push({
      kind,
      left: hasLeft ? leftText : '',
      right: hasRight ? rightText : '',
      leftNo: hasLeft ? leftLineNo : null,
      rightNo: hasRight ? rightLineNo : null
    });
    if (hasLeft) {
      leftLineNo += 1;
    }
    if (hasRight) {
      rightLineNo += 1;
    }
  };

  for (let i = 0; i < ops.length; i += 1) {
    const op = ops[i];

    if (op.type === 'equal') {
      pushRow('equal', leftLines[op.aIndex], rightLines[op.bIndex]);
      continue;
    }

    if (op.type === 'delete') {
      const deletes = [];
      let cursor = i;
      while (cursor < ops.length && ops[cursor].type === 'delete') {
        deletes.push(ops[cursor]);
        cursor += 1;
      }

      const inserts = [];
      while (cursor < ops.length && ops[cursor].type === 'insert') {
        inserts.push(ops[cursor]);
        cursor += 1;
      }

      const maxLen = Math.max(deletes.length, inserts.length);
      for (let step = 0; step < maxLen; step += 1) {
        const del = deletes[step];
        const ins = inserts[step];
        const leftText = del ? leftLines[del.aIndex] : null;
        const rightText = ins ? rightLines[ins.bIndex] : null;
        const kind = del && ins ? 'replace' : del ? 'delete' : 'insert';
        pushRow(kind, leftText, rightText);
      }

      i = cursor - 1;
      continue;
    }

    if (op.type === 'insert') {
      pushRow('insert', null, rightLines[op.bIndex]);
    }
  }

  return rows;
}

function diffInlineSegments(leftText, rightText, { ignoreCase }) {
  const leftChars = Array.from(leftText);
  const rightChars = Array.from(rightText);

  const leftKeys = leftChars.map((ch) => (ignoreCase ? ch.toLowerCase() : ch));
  const rightKeys = rightChars.map((ch) => (ignoreCase ? ch.toLowerCase() : ch));
  const ops = myersDiffOps(leftKeys, rightKeys);

  const leftSegments = [];
  const rightSegments = [];

  const pushSeg = (target, type, text) => {
    if (!text) {
      return;
    }
    const last = target[target.length - 1];
    if (last && last.type === type) {
      last.text += text;
      return;
    }
    target.push({ type, text });
  };

  for (const op of ops) {
    if (op.type === 'equal') {
      pushSeg(leftSegments, 'equal', leftChars[op.aIndex] || '');
      pushSeg(rightSegments, 'equal', rightChars[op.bIndex] || '');
      continue;
    }
    if (op.type === 'delete') {
      pushSeg(leftSegments, 'delete', leftChars[op.aIndex] || '');
      continue;
    }
    if (op.type === 'insert') {
      pushSeg(rightSegments, 'insert', rightChars[op.bIndex] || '');
    }
  }

  return { leftSegments, rightSegments };
}

function normalizeLineForDisplay(line) {
  if (line === '') {
    return ' ';
  }
  return line;
}

function TextDiffPage() {
  const [leftText, setLeftText] = useState('');
  const [rightText, setRightText] = useState('');
  const [ignoreCase, setIgnoreCase] = useState(false);
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const [showOnlyDiff, setShowOnlyDiff] = useState(false);
  const [inlineDiff, setInlineDiff] = useState(true);
  const [rows, setRows] = useState([]);

  const summary = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc[row.kind] += 1;
        return acc;
      },
      { equal: 0, insert: 0, delete: 0, replace: 0 }
    );
  }, [rows]);

  const visibleRows = useMemo(() => {
    if (!showOnlyDiff) {
      return rows;
    }
    return rows.filter((row) => row.kind !== 'equal');
  }, [rows, showOnlyDiff]);

  const handleCompare = () => {
    const leftLines = splitLines(leftText);
    const rightLines = splitLines(rightText);
    const options = { ignoreCase, ignoreWhitespace };
    const leftKeys = leftLines.map((line) => normalizeLine(line, options));
    const rightKeys = rightLines.map((line) => normalizeLine(line, options));

    const ops = myersDiffOps(leftKeys, rightKeys);
    const nextRows = buildDiffRows(ops, leftLines, rightLines);

    if (inlineDiff && !ignoreWhitespace) {
      for (const row of nextRows) {
        if (row.kind !== 'replace') {
          continue;
        }
        if (!row.left || !row.right) {
          continue;
        }
        const maxInline = 2000;
        if (row.left.length > maxInline || row.right.length > maxInline) {
          continue;
        }
        const segments = diffInlineSegments(row.left, row.right, { ignoreCase });
        row.leftSegments = segments.leftSegments;
        row.rightSegments = segments.rightSegments;
      }
    }

    setRows(nextRows);
  };

  const handleSwap = () => {
    setRows([]);
    setLeftText(rightText);
    setRightText(leftText);
  };

  const handleClear = () => {
    setLeftText('');
    setRightText('');
    setRows([]);
  };

  const renderSegments = (segments, fallbackText, side) => {
    if (!segments || !segments.length) {
      return normalizeLineForDisplay(fallbackText);
    }

    return segments.map((seg, idx) => {
      let className = 'diff-seg';
      if (seg.type === 'delete') {
        className = 'diff-seg seg-del';
      } else if (seg.type === 'insert') {
        className = 'diff-seg seg-add';
      } else if (seg.type === 'equal') {
        className = 'diff-seg';
      }

      const safeText = normalizeLineForDisplay(seg.text);
      return (
        <span className={className} key={`${side}-${idx}`}>
          {safeText}
        </span>
      );
    });
  };

  return (
    <ToolPageShell title="在线文本内容对比" desc="对比两段文本差异，支持行级高亮与可选行内高亮。">
      <div className="diff-input-grid">
        <div>
          <label className="field-label" htmlFor="diff-left">
            原文
          </label>
          <textarea
            id="diff-left"
            placeholder="粘贴第一段文本"
            rows={10}
            value={leftText}
            onChange={(e) => setLeftText(e.target.value)}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="diff-right">
            对比文本
          </label>
          <textarea
            id="diff-right"
            placeholder="粘贴第二段文本"
            rows={10}
            value={rightText}
            onChange={(e) => setRightText(e.target.value)}
          />
        </div>
      </div>

      <div className="check-row diff-options">
        <label className="check-label">
          <input
            type="checkbox"
            checked={ignoreCase}
            onChange={(e) => setIgnoreCase(e.target.checked)}
          />
          <span>忽略大小写</span>
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={ignoreWhitespace}
            onChange={(e) => {
              const next = e.target.checked;
              setIgnoreWhitespace(next);
              if (next) {
                setInlineDiff(false);
              }
            }}
          />
          <span>忽略空白差异</span>
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={showOnlyDiff}
            onChange={(e) => setShowOnlyDiff(e.target.checked)}
          />
          <span>仅显示差异</span>
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={inlineDiff}
            disabled={ignoreWhitespace}
            onChange={(e) => setInlineDiff(e.target.checked)}
          />
          <span>行内高亮</span>
        </label>
      </div>

      <div className="actions">
        <button type="button" onClick={handleCompare}>
          开始对比
        </button>
        <button type="button" onClick={handleSwap}>
          交换
        </button>
        <button type="button" onClick={handleClear}>
          清空
        </button>
      </div>

      {rows.length ? (
        <div className="diff-result">
          <p className="diff-summary">
            新增 {summary.insert} 行，删除 {summary.delete} 行，修改 {summary.replace} 行
          </p>
          <div className="diff-table">
            <div className="diff-table-head">
              <div className="diff-side-title">原文</div>
              <div className="diff-side-title">对比文本</div>
            </div>
            <div className="diff-table-body">
              {visibleRows.map((row, idx) => (
                <div className={`diff-row diff-${row.kind}`} key={`${row.kind}-${idx}`}>
                  <div className="diff-cell diff-left">
                    <span className="diff-lineno">{row.leftNo ?? ''}</span>
                    <span className="diff-code">
                      {renderSegments(row.leftSegments, row.left, 'left')}
                    </span>
                  </div>
                  <div className="diff-cell diff-right">
                    <span className="diff-lineno">{row.rightNo ?? ''}</span>
                    <span className="diff-code">
                      {renderSegments(row.rightSegments, row.right, 'right')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <p className="status-text">输入两段文本后点击“开始对比”。</p>
      )}
    </ToolPageShell>
  );
}

export default TextDiffPage;
