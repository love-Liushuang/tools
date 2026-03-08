export const categories = [
    { key: 'all', label: '全部工具' },
    { key: 'image', label: '图片处理' },
    { key: 'text', label: '文本处理' },
    { key: 'wps', label: 'WPS' },
    { key: 'encode', label: '编码转换' },
    { key: 'dev', label: '开发工具' },
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
        desc: '统计字数、字符数、行数。',
        category: 'text',
        path: '/tools/text-stats'
    },
    {
        id: 'text-letter',
        name: '文本加密为字母',
        desc: '在文本与字母密文之间转换。',
        category: 'text',
        path: '/tools/text-letter'
    },
    {
        id: 'unlock-pdf',
        name: 'PDF 解密',
        desc: '上传 PDF，去限制并下载。',
        category: 'wps',
        path: '/tools/unlock-pdf'
    },
    {
        id: 'image-convert',
        name: '在线图片转换',
        desc: '支持 WebP/PNG/JPG 批量转换与尺寸限制。',
        category: 'image',
        path: '/tools/image-convert'
    }
];

export const featuredToolIds = ['text-letter', 'unlock-pdf', 'image-convert'];
