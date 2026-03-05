export const categories = [
  { key: 'all', label: '全部工具' },
  { key: 'dev', label: '开发常用' },
  { key: 'text', label: '文本处理' },
  { key: 'encode', label: '编码转换' }
];

export const tools = [
  {
    id: 'json-formatter',
    name: 'JSON 格式化',
    desc: '支持格式化和压缩 JSON。',
    category: 'dev',
    path: '/tools/json-formatter'
  },
  {
    id: 'base64',
    name: 'Base64 编解码',
    desc: '支持中文文本的 Base64 转换。',
    category: 'encode',
    path: '/tools/base64'
  },
  {
    id: 'text-stats',
    name: '文本统计',
    desc: '调用后端 API 统计字数、字符数、行数。',
    category: 'text',
    path: '/tools/text-stats'
  }
];
