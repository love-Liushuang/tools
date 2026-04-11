import { useEffect, useMemo, useState } from 'react';
import ToolPageShell from '../components/ToolPageShell';
import { copyText } from '../lib/tool';


function stripCommentsAndTrailingCommas(text) {
  const input = String(text || '');
  const len = input.length;
  let out = '';

  let i = 0;
  let inString = false;
  let quote = '"';
  let escaped = false;

  const isWhitespace = (ch) => ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';

  const skipWhitespaceAndComments = (startIndex) => {
    let cursor = startIndex;
    while (cursor < len) {
      const ch = input[cursor];
      const next = cursor + 1 < len ? input[cursor + 1] : '';

      if (isWhitespace(ch)) {
        cursor += 1;
        continue;
      }

      if (ch === '/' && next === '/') {
        cursor += 2;
        while (cursor < len && input[cursor] !== '\n') {
          cursor += 1;
        }
        continue;
      }

      if (ch === '/' && next === '*') {
        cursor += 2;
        while (cursor + 1 < len && !(input[cursor] === '*' && input[cursor + 1] === '/')) {
          cursor += 1;
        }
        cursor = Math.min(len, cursor + 2);
        continue;
      }

      break;
    }
    return cursor;
  };

  while (i < len) {
    const ch = input[i];
    const next = i + 1 < len ? input[i + 1] : '';

    if (inString) {
      out += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === quote) {
        inString = false;
      }
      i += 1;
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      quote = ch;
      out += ch;
      i += 1;
      continue;
    }

    if (ch === '/' && next === '/') {
      i += 2;
      while (i < len && input[i] !== '\n') {
        i += 1;
      }
      continue;
    }

    if (ch === '/' && next === '*') {
      i += 2;
      let newlines = 0;
      while (i + 1 < len && !(input[i] === '*' && input[i + 1] === '/')) {
        if (input[i] === '\n') {
          newlines += 1;
        }
        i += 1;
      }
      i = Math.min(len, i + 2);
      if (newlines) {
        out += '\n'.repeat(newlines);
      }
      continue;
    }

    if (ch === ',') {
      const cursor = skipWhitespaceAndComments(i + 1);
      const ahead = cursor < len ? input[cursor] : '';
      if (ahead === '}' || ahead === ']') {
        i += 1;
        continue;
      }
      out += ch;
      i += 1;
      continue;
    }

    out += ch;
    i += 1;
  }

  return out;
}

function preprocessJsonText(text, { lenient }) {
  let input = String(text || '');
  input = input.replace(/^\uFEFF/, '');
  if (!lenient) {
    return input;
  }
  return stripCommentsAndTrailingCommas(input);
}

function extractJsonErrorPosition(message) {
  const match = String(message || '').match(/position\s+(\d+)/i);
  if (!match) {
    return null;
  }
  const pos = Number(match[1]);
  return Number.isFinite(pos) ? pos : null;
}

function positionToLineCol(text, position) {
  const safePos = Math.max(0, Math.min(Number(position) || 0, text.length));
  const slice = text.slice(0, safePos);
  const lines = slice.split('\n');
  const line = lines.length;
  const col = (lines[lines.length - 1] || '').length + 1;
  return { line, col };
}

function snippetAround(text, position, radius = 40) {
  const pos = Math.max(0, Math.min(Number(position) || 0, text.length));
  const start = Math.max(0, pos - radius);
  const end = Math.min(text.length, pos + radius);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < text.length ? '...' : '';
  return `${prefix}${text.slice(start, end).replace(/\n/g, '\\n')}${suffix}`;
}

function deepSortJsonKeys(value) {
  if (Array.isArray(value)) {
    return value.map(deepSortJsonKeys);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  const keys = Object.keys(value).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  const result = {};
  keys.forEach((key) => {
    result[key] = deepSortJsonKeys(value[key]);
  });
  return result;
}

function isValidTsIdentifier(name) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);
}

function schemaKey(schema) {
  if (!schema || typeof schema !== 'object') {
    return 'unknown';
  }
  switch (schema.kind) {
    case 'string':
    case 'number':
    case 'boolean':
    case 'null':
    case 'unknown':
      return schema.kind;
    case 'array':
      return `array(${schemaKey(schema.element)})`;
    case 'object': {
      const keys = Object.keys(schema.props || {}).sort();
      const parts = keys.map((k) => {
        const p = schema.props[k];
        const flag = p && p.optional ? '?' : '';
        return `${k}${flag}:${schemaKey(p && p.schema)}`;
      });
      return `object(${parts.join(',')})`;
    }
    case 'union': {
      const parts = (schema.variants || []).map(schemaKey).sort();
      return `union(${parts.join('|')})`;
    }
    default:
      return 'unknown';
  }
}

function normalizeUnion(variants) {
  const flat = [];
  variants.forEach((item) => {
    if (!item) {
      return;
    }
    if (item.kind === 'union') {
      flat.push(...(item.variants || []));
      return;
    }
    flat.push(item);
  });

  const unique = new Map();
  flat.forEach((item) => {
    unique.set(schemaKey(item), item);
  });

  const list = Array.from(unique.values());
  if (list.length === 1) {
    return list[0];
  }
  return { kind: 'union', variants: list };
}

function mergeObjectSchema(a, b) {
  const props = {};
  const keys = new Set([...Object.keys(a.props || {}), ...Object.keys(b.props || {})]);
  keys.forEach((key) => {
    const aProp = a.props && a.props[key];
    const bProp = b.props && b.props[key];
    if (aProp && bProp) {
      props[key] = {
        schema: mergeSchema(aProp.schema, bProp.schema),
        optional: Boolean(aProp.optional || bProp.optional)
      };
    } else if (aProp) {
      props[key] = { schema: aProp.schema, optional: true };
    } else if (bProp) {
      props[key] = { schema: bProp.schema, optional: true };
    }
  });
  return { kind: 'object', props };
}

function mergeSchema(a, b) {
  if (!a) {
    return b;
  }
  if (!b) {
    return a;
  }
  if (a.kind === 'unknown') {
    return b;
  }
  if (b.kind === 'unknown') {
    return a;
  }
  if (a.kind === b.kind) {
    if (a.kind === 'array') {
      return { kind: 'array', element: mergeSchema(a.element, b.element) };
    }
    if (a.kind === 'object') {
      return mergeObjectSchema(a, b);
    }
    if (a.kind === 'union') {
      return normalizeUnion([...(a.variants || []), ...(b.variants || [])]);
    }
    return a;
  }
  return normalizeUnion([a, b]);
}

function inferSchema(value, ctx, depth = 0) {
  if (depth > ctx.maxDepth) {
    return { kind: 'unknown' };
  }
  if (value === null) {
    return { kind: 'null' };
  }
  if (Array.isArray(value)) {
    if (!value.length) {
      return { kind: 'array', element: { kind: 'unknown' } };
    }
    const sample = value.slice(0, ctx.maxArraySamples);
    let merged = inferSchema(sample[0], ctx, depth + 1);
    for (let i = 1; i < sample.length; i += 1) {
      merged = mergeSchema(merged, inferSchema(sample[i], ctx, depth + 1));
    }
    return { kind: 'array', element: merged };
  }

  const t = typeof value;
  if (t === 'string') {
    return { kind: 'string' };
  }
  if (t === 'number') {
    return { kind: 'number' };
  }
  if (t === 'boolean') {
    return { kind: 'boolean' };
  }
  if (t === 'object') {
    const props = {};
    Object.keys(value).forEach((key) => {
      props[key] = { schema: inferSchema(value[key], ctx, depth + 1), optional: false };
    });
    return { kind: 'object', props };
  }
  return { kind: 'unknown' };
}

function schemaToTs(schema, indentSize, level = 0) {
  if (!schema || typeof schema !== 'object') {
    return 'any';
  }
  switch (schema.kind) {
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'null':
      return 'null';
    case 'unknown':
      return 'any';
    case 'array': {
      const inner = schemaToTs(schema.element, indentSize, level);
      return `Array<${inner}>`;
    }
    case 'object': {
      const entries = Object.entries(schema.props || {}).sort(([a], [b]) => a.localeCompare(b));
      if (!entries.length) {
        return 'Record<string, any>';
      }
      const pad = ' '.repeat((level + 1) * indentSize);
      const pad0 = ' '.repeat(level * indentSize);
      const lines = entries.map(([key, prop]) => {
        const name = isValidTsIdentifier(key) ? key : JSON.stringify(key);
        const optional = prop && prop.optional ? '?' : '';
        const typeText = schemaToTs(prop && prop.schema, indentSize, level + 1);
        return `${pad}${name}${optional}: ${typeText};`;
      });
      return `{\n${lines.join('\n')}\n${pad0}}`;
    }
    case 'union': {
      const parts = (schema.variants || []).map((item) => schemaToTs(item, indentSize, level));
      const pretty = parts
        .map((part) => (part.includes('\n') ? `(${part})` : part))
        .sort((a, b) => a.localeCompare(b));
      return pretty.join(' | ');
    }
    default:
      return 'any';
  }
}

function toPascalCase(input) {
  const text = String(input || '').replace(/[^A-Za-z0-9]+/g, ' ').trim();
  if (!text) {
    return '';
  }
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join('');
}

function uniqueName(base, used) {
  let safe = String(base || '').trim();
  if (!safe) {
    safe = 'Field';
  }
  if (!/^[A-Za-z_]/.test(safe)) {
    safe = `Field${safe}`;
  }
  safe = safe.slice(0, 1).toUpperCase() + safe.slice(1);

  let candidate = safe;
  let counter = 2;
  while (used.has(candidate)) {
    candidate = `${safe}${counter}`;
    counter += 1;
  }
  used.add(candidate);
  return candidate;
}

function goStringLiteral(value) {
  const text = String(value);
  if (!text.includes('`')) {
    return `\`${text}\``;
  }
  return JSON.stringify(text);
}

function unwrapNullable(schema) {
  if (!schema || schema.kind !== 'union') {
    return { schema, nullable: false };
  }
  const variants = schema.variants || [];
  const nonNull = variants.filter((v) => v && v.kind !== 'null');
  const hasNull = nonNull.length !== variants.length;
  if (hasNull && nonNull.length === 1) {
    return { schema: nonNull[0], nullable: true };
  }
  return { schema, nullable: false };
}

function shouldPointer(goType) {
  return (
    goType &&
    goType !== 'interface{}' &&
    !goType.startsWith('*') &&
    !goType.startsWith('[]') &&
    !goType.startsWith('map[')
  );
}

function createGoGenerator() {
  const ctx = {
    defs: [],
    usedTypeNames: new Set(),
    seenStructs: new Map()
  };

  const renderType = (schema, nameHint) => {
    if (!schema || typeof schema !== 'object') {
      return 'interface{}';
    }

    const { schema: base } = unwrapNullable(schema);
    if (!base || typeof base !== 'object') {
      return 'interface{}';
    }

    switch (base.kind) {
      case 'string':
        return 'string';
      case 'number':
        return 'float64';
      case 'boolean':
        return 'bool';
      case 'null':
      case 'unknown':
        return 'interface{}';
      case 'union':
        return 'interface{}';
      case 'array': {
        const elem = renderType(base.element, `${nameHint}Item`);
        return `[]${elem}`;
      }
      case 'object':
        return renderStruct(base, nameHint);
      default:
        return 'interface{}';
    }
  };

  const renderFieldType = (schema, nameHint, optional) => {
    const unwrapped = unwrapNullable(schema);
    const baseType = renderType(unwrapped.schema, nameHint);
    const needsPtr = (optional || unwrapped.nullable) && shouldPointer(baseType);
    return needsPtr ? `*${baseType}` : baseType;
  };

  const renderStruct = (schema, nameHint) => {
    const signature = schemaKey(schema);
    const hit = ctx.seenStructs.get(signature);
    if (hit) {
      return hit;
    }

    const baseName = toPascalCase(nameHint) || 'AutoGenerated';
    const typeName = uniqueName(baseName, ctx.usedTypeNames);
    ctx.seenStructs.set(signature, typeName);

    const fieldUsed = new Set();
    const entries = Object.entries(schema.props || {}).sort(([a], [b]) => a.localeCompare(b));
    const lines = entries.map(([key, prop]) => {
      const fieldBase = toPascalCase(key) || 'Field';
      const fieldName = uniqueName(fieldBase, fieldUsed);

      const optional = Boolean(prop && prop.optional);
      const unwrapped = unwrapNullable(prop && prop.schema);
      const goType = renderFieldType(prop && prop.schema, `${typeName}${fieldName}`, optional);
      const omitempty = optional || unwrapped.nullable;
      const tag = `json:"${key}${omitempty ? ',omitempty' : ''}"`;
      return `  ${fieldName} ${goType} ${goStringLiteral(tag)}`;
    });

    ctx.defs.push(`type ${typeName} struct {\n${lines.join('\n')}\n}`);
    return typeName;
  };

  const generate = (schema, rootName = 'Root') => {
    if (!schema || typeof schema !== 'object') {
      return `type ${rootName} interface{}`;
    }

    if (schema.kind === 'object') {
      renderStruct(schema, rootName);
    } else if (schema.kind === 'array') {
      ctx.usedTypeNames.add(rootName);
      const elem = renderType(schema.element, `${rootName}Item`);
      ctx.defs.push(`type ${rootName} []${elem}`);
    } else {
      ctx.usedTypeNames.add(rootName);
      const base = renderType(schema, rootName);
      ctx.defs.push(`type ${rootName} ${base}`);
    }

    const defs = ctx.defs.slice();
    const rootIndex = defs.findIndex((item) => item.startsWith(`type ${rootName} `));
    if (rootIndex > 0) {
      const [root] = defs.splice(rootIndex, 1);
      defs.unshift(root);
    }

    return defs.join('\n\n');
  };

  return { generate };
}

function downloadText(filename, text, mime = 'application/json;charset=utf-8') {
  const blob = new Blob([String(text || '')], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'data.txt';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const MAX_TREE_CHILDREN = 200;

function JsonTreeNode({ name, value, depth }) {
  const isArray = Array.isArray(value);
  const isObject = !!value && typeof value === 'object' && !isArray;
  const canExpand = isArray || isObject;

  const typeLabel = useMemo(() => {
    if (value === null) {
      return 'null';
    }
    if (isArray) {
      return `Array(${value.length})`;
    }
    if (isObject) {
      return `Object(${Object.keys(value).length})`;
    }
    return typeof value;
  }, [isArray, isObject, value]);

  if (!canExpand) {
    let display = '';
    if (typeof value === 'string') {
      display = JSON.stringify(value);
    } else {
      display = String(value);
    }
    return (
      <div className="json-leaf">
        <span className="json-key">{name}</span>
        <span className="json-colon">:</span>
        <span className="json-val">{display}</span>
        <span className="json-type">{typeLabel}</span>
      </div>
    );
  }

  let visible = [];
  let hiddenCount = 0;
  if (isArray) {
    const total = value.length;
    const visibleCount = Math.min(total, MAX_TREE_CHILDREN);
    visible = Array.from({ length: visibleCount }, (_, idx) => [String(idx), value[idx]]);
    hiddenCount = Math.max(0, total - visibleCount);
  } else {
    const keys = Object.keys(value);
    const visibleKeys = keys.slice(0, MAX_TREE_CHILDREN);
    visible = visibleKeys.map((key) => [key, value[key]]);
    hiddenCount = Math.max(0, keys.length - visibleKeys.length);
  }
  const openByDefault = depth < 1;

  return (
    <details className="json-node" open={openByDefault}>
      <summary>
        <span className="json-key">{name}</span>
        <span className="json-type">{typeLabel}</span>
      </summary>
      <div className="json-children">
        {visible.length ? (
          visible.map(([key, child]) => (
            <JsonTreeNode
              key={`${depth}-${name}-${key}`}
              name={key}
              value={child}
              depth={depth + 1}
            />
          ))
        ) : (
          <div className="json-empty">(empty)</div>
        )}
        {hiddenCount ? <div className="json-more">... 还有 {hiddenCount} 项未显示</div> : null}
      </div>
    </details>
  );
}

function parseJsonPath(pathText) {
  let path = String(pathText || '').trim();
  if (!path) {
    return [];
  }
  if (path.startsWith('$')) {
    path = path.slice(1);
    if (path.startsWith('.')) {
      path = path.slice(1);
    }
  }

  const parts = [];
  let i = 0;

  const readIdentifier = () => {
    const start = i;
    while (i < path.length && path[i] !== '.' && path[i] !== '[') {
      i += 1;
    }
    return path.slice(start, i).trim();
  };

  const readQuoted = (quoteChar) => {
    i += 1;
    let result = '';
    let escaped = false;
    while (i < path.length) {
      const ch = path[i];
      if (escaped) {
        result += ch;
        escaped = false;
        i += 1;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        i += 1;
        continue;
      }
      if (ch === quoteChar) {
        i += 1;
        return result;
      }
      result += ch;
      i += 1;
    }
    throw new Error('JSONPath 字符串未闭合');
  };

  while (i < path.length) {
    const ch = path[i];
    if (ch === '.') {
      i += 1;
      continue;
    }
    if (ch === '[') {
      i += 1;
      while (i < path.length && /\s/.test(path[i])) {
        i += 1;
      }
      let token = '';
      if (path[i] === '"' || path[i] === "'") {
        token = readQuoted(path[i]);
      } else {
        const start = i;
        while (i < path.length && path[i] !== ']') {
          i += 1;
        }
        token = path.slice(start, i).trim();
      }
      while (i < path.length && path[i] !== ']') {
        i += 1;
      }
      if (path[i] !== ']') {
        throw new Error('JSONPath 缺少 ]');
      }
      i += 1;

      if (/^\d+$/.test(token)) {
        parts.push(Number(token));
      } else if (token) {
        parts.push(token);
      }
      continue;
    }

    const id = readIdentifier();
    if (id) {
      parts.push(id);
    }
  }

  return parts;
}

function getJsonByPath(root, segments) {
  let current = root;
  for (const seg of segments) {
    if (current === null || current === undefined) {
      throw new Error('路径不存在（遇到空值）');
    }
    if (typeof seg === 'number') {
      if (!Array.isArray(current)) {
        throw new Error('路径段为数组下标，但当前不是数组');
      }
      current = current[seg];
      continue;
    }
    if (typeof current !== 'object') {
      throw new Error('路径段为对象 key，但当前不是对象');
    }
    current = current[seg];
  }
  return current;
}

function JsonFormatterPage() {
  const [input, setInput] = useState('{\n  "name": "box-tools"\n}');
  const [output, setOutput] = useState('');
  const [notice, setNotice] = useState('');
  const [noticeIsError, setNoticeIsError] = useState(false);
  const [indent, setIndent] = useState(2);
  const [lenient, setLenient] = useState(true);
  const [sortKeys, setSortKeys] = useState(false);

  const [parsed, setParsed] = useState(null);
  const [jsonPath, setJsonPath] = useState('$.name');
  const [jsonPathResult, setJsonPathResult] = useState('');
  const [tsTypes, setTsTypes] = useState('');
  const [goTypes, setGoTypes] = useState('');

  useEffect(() => {
    setParsed(null);
    setJsonPathResult('');
    setTsTypes('');
    setGoTypes('');
  }, [input, lenient]);

  const setInfo = (msg) => {
    setNotice(msg || '');
    setNoticeIsError(false);
  };

  const setError = (msg) => {
    setNotice(msg || '');
    setNoticeIsError(true);
  };

  const parseCurrent = () => {
    const prepared = preprocessJsonText(input, { lenient });
    try {
      const value = JSON.parse(prepared);
      setParsed(value);
      return { ok: true, value, prepared };
    } catch (err) {
      const pos = extractJsonErrorPosition(err && err.message);
      if (pos !== null) {
        const { line, col } = positionToLineCol(prepared, pos);
        setError(
          `解析失败: ${err.message}（第 ${line} 行，第 ${col} 列），附近内容: ${snippetAround(prepared, pos)}`
        );
      } else {
        setError(`解析失败: ${err.message || 'JSON 无法解析'}`);
      }
      setParsed(null);
      return { ok: false, prepared };
    }
  };

  const summarizeRoot = (value) => {
    if (value === null) {
      return '根节点：null';
    }
    if (Array.isArray(value)) {
      return `根节点：Array(${value.length})`;
    }
    if (typeof value === 'object') {
      return `根节点：Object(${Object.keys(value).length})`;
    }
    return `根节点：${typeof value}`;
  };

  const rootSummary = useMemo(() => {
    if (parsed === null || parsed === undefined) {
      return '';
    }
    if (Array.isArray(parsed)) {
      return `根节点：Array(${parsed.length})`;
    }
    if (typeof parsed === 'object') {
      return `根节点：Object(${Object.keys(parsed).length})`;
    }
    return `根节点：${typeof parsed}`;
  }, [parsed]);

  const handleFormat = () => {
    const res = parseCurrent();
    if (!res.ok) {
      return;
    }
    const normalized = sortKeys ? deepSortJsonKeys(res.value) : res.value;
    setOutput(JSON.stringify(normalized, null, indent));
    setInfo('已格式化。');
  };

  const handleMinify = () => {
    const res = parseCurrent();
    if (!res.ok) {
      return;
    }
    const normalized = sortKeys ? deepSortJsonKeys(res.value) : res.value;
    setOutput(JSON.stringify(normalized));
    setInfo('已压缩为单行。');
  };

  const handleValidate = () => {
    const res = parseCurrent();
    if (!res.ok) {
      return;
    }
    setInfo(`JSON 校验通过。${res.value !== undefined ? ` ${summarizeRoot(res.value)}` : ''}`);
  };

  const handleSortKeys = () => {
    const res = parseCurrent();
    if (!res.ok) {
      return;
    }
    const normalized = deepSortJsonKeys(res.value);
    setOutput(JSON.stringify(normalized, null, indent));
    setInfo('已按 key 排序（递归）。');
  };

  const handleEncodeUrl = () => {
    const res = parseCurrent();
    if (!res.ok) {
      return;
    }
    const normalized = sortKeys ? deepSortJsonKeys(res.value) : res.value;
    const minified = JSON.stringify(normalized);
    setOutput(encodeURIComponent(minified));
    setInfo('已生成 URL 编码结果（对压缩 JSON 编码）。');
  };

  const handleCopyOutput = async () => {
    const ok = await copyText(output);
    if (ok) {
        setInfo('已复制输出内容。');
    } else {
        setError('复制失败，请检查浏览器权限。');
    }
  };

  const handleDownloadOutput = () => {
    if (!output) {
      setError('没有可下载的输出内容。');
      return;
    }
    downloadText('output.txt', output, 'text/plain;charset=utf-8');
    setInfo('已开始下载。');
  };

  const handleLoadFile = async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) {
      return;
    }
    try {
      const text = await file.text();
      setInput(text);
      setOutput('');
      setNotice('');
    } catch (err) {
      setError('读取文件失败。');
    } finally {
      event.target.value = '';
    }
  };

  const runJsonPath = () => {
    const res = parseCurrent();
    if (!res.ok) {
      return;
    }
    try {
      const segments = parseJsonPath(jsonPath);
      const value = getJsonByPath(res.value, segments);
      const typeLabel = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
      const rendered = typeof value === 'string'
        ? value
        : typeof value === 'number' || typeof value === 'boolean' || value === null
          ? String(value)
          : JSON.stringify(value, null, 2);
      setJsonPathResult(`(${typeLabel}) ${rendered}`);
      setInfo('JSONPath 取值完成。');
    } catch (err) {
      setJsonPathResult('');
      setError(err.message || 'JSONPath 解析失败');
    }
  };

  const runTsTypes = () => {
    const res = parseCurrent();
    if (!res.ok) {
      return;
    }
    const schema = inferSchema(res.value, { maxDepth: 12, maxArraySamples: 80 });
    const typeText = schemaToTs(schema, 2, 0);
    setTsTypes(`export type Root = ${typeText};\n`);
    setInfo('已生成 TypeScript 类型。');
  };

  const runGoStruct = () => {
    const res = parseCurrent();
    if (!res.ok) {
      return;
    }
    const schema = inferSchema(res.value, { maxDepth: 12, maxArraySamples: 80 });
    const gen = createGoGenerator();
    setGoTypes(`${gen.generate(schema, 'Root')}\n`);
    setInfo('已生成 Go struct。');
  };

  const copyPanel = async (text) => {
    const ok = await copyText(output);
    if (ok) {
        setInfo('已复制。');
    } else {
        setError('复制失败，请检查浏览器权限。');
    }
  };

  return (
    <ToolPageShell title="JSON 工具大全" desc="格式化/压缩/校验/排序/Tree/JSONPath/生成类型等。">
      <div className="json-form-grid">
        <label className="field-block">
          <span>缩进空格</span>
          <select value={indent} onChange={(e) => setIndent(Number(e.target.value) || 2)}>
            <option value={2}>2 spaces</option>
            <option value={4}>4 spaces</option>
          </select>
        </label>
        <label className="field-block">
          <span>导入 JSON 文件</span>
          <input type="file" accept="application/json,.json" onChange={handleLoadFile} />
        </label>
      </div>

      <div className="check-row json-options">
        <label className="check-label">
          <input type="checkbox" checked={lenient} onChange={(e) => setLenient(e.target.checked)} />
          <span>宽松解析（支持注释/尾逗号）</span>
        </label>
        <label className="check-label">
          <input type="checkbox" checked={sortKeys} onChange={(e) => setSortKeys(e.target.checked)} />
          <span>操作时递归排序 key</span>
        </label>
      </div>

      <div className="json-io-grid">
        <div>
          <label className="field-label" htmlFor="json-input">
            输入
          </label>
          <textarea
            id="json-input"
            className="mono-textarea"
            rows={12}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="粘贴 JSON（或包含注释/尾逗号的 JSON5 风格内容）"
          />
        </div>
        <div>
          <label className="field-label" htmlFor="json-output">
            输出
          </label>
          <textarea
            id="json-output"
            className="mono-textarea"
            rows={12}
            readOnly
            value={output}
            placeholder="这里显示格式化/压缩/转换结果"
          />
        </div>
      </div>

      <div className="actions">
        <button type="button" onClick={handleFormat}>
          格式化
        </button>
        <button type="button" onClick={handleMinify}>
          压缩
        </button>
        <button type="button" onClick={handleValidate}>
          校验
        </button>
        <button type="button" onClick={handleSortKeys}>
          排序 Key
        </button>
        <button type="button" onClick={handleEncodeUrl}>
          URL 编码
        </button>
        <button type="button" onClick={handleCopyOutput} disabled={!output}>
          复制输出
        </button>
        <button type="button" onClick={handleDownloadOutput} disabled={!output}>
          下载输出
        </button>
      </div>

      {notice ? <p className={noticeIsError ? 'error' : 'status-text'}>{notice}</p> : null}
      {parsed !== null && !noticeIsError && rootSummary ? <p className="json-summary">{rootSummary}</p> : null}

      <div className="json-panels">
        <details className="json-panel" open>
          <summary>JSON Tree 查看</summary>
          <div className="json-panel-body">
            <div className="actions">
              <button type="button" onClick={handleValidate}>
                解析/刷新
              </button>
            </div>
            {parsed === null ? (
              <p className="status-text">点击“解析/刷新”后展示 Tree。</p>
            ) : (
              <div className="json-tree">
                <JsonTreeNode name="$" value={parsed} depth={0} />
              </div>
            )}
          </div>
        </details>

        <details className="json-panel">
          <summary>JSONPath 取值</summary>
          <div className="json-panel-body">
            <label className="field-label" htmlFor="jsonpath-input">
              JSONPath
            </label>
            <input
              id="jsonpath-input"
              type="text"
              value={jsonPath}
              onChange={(e) => setJsonPath(e.target.value)}
              placeholder="例如：$.data.items[0].name 或 data.items[0].name"
            />
            <div className="actions">
              <button type="button" onClick={runJsonPath}>
                取值
              </button>
              <button type="button" onClick={() => copyPanel(jsonPathResult)} disabled={!jsonPathResult}>
                复制结果
              </button>
            </div>
            {jsonPathResult ? <pre>{jsonPathResult}</pre> : <p className="status-text">填写路径后点击取值。</p>}
          </div>
        </details>

        <details className="json-panel">
          <summary>TypeScript 类型生成</summary>
          <div className="json-panel-body">
            <div className="actions">
              <button type="button" onClick={runTsTypes}>
                生成
              </button>
              <button type="button" onClick={() => copyPanel(tsTypes)} disabled={!tsTypes}>
                复制
              </button>
              <button
                type="button"
                onClick={() => downloadText('types.ts', tsTypes, 'text/plain;charset=utf-8')}
                disabled={!tsTypes}
              >
                下载
              </button>
            </div>
            {tsTypes ? <pre>{tsTypes}</pre> : <p className="status-text">点击生成后输出 Root 类型。</p>}
          </div>
        </details>

        <details className="json-panel">
          <summary>Go struct 生成</summary>
          <div className="json-panel-body">
            <div className="actions">
              <button type="button" onClick={runGoStruct}>
                生成
              </button>
              <button type="button" onClick={() => copyPanel(goTypes)} disabled={!goTypes}>
                复制
              </button>
              <button
                type="button"
                onClick={() => downloadText('types.go', goTypes, 'text/plain;charset=utf-8')}
                disabled={!goTypes}
              >
                下载
              </button>
            </div>
            {goTypes ? <pre>{goTypes}</pre> : <p className="status-text">点击生成后输出 Root struct。</p>}
          </div>
        </details>
      </div>
    </ToolPageShell>
  );
}

export default JsonFormatterPage;
