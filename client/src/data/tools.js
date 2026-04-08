export const categories = [
    { key: 'all', label: '全部工具' },
    { key: 'image', label: '图片处理' },
    { key: 'video', label: '视频处理' },
    { key: 'text', label: '文本处理' },
    { key: 'wps', label: 'WPS' },
    { key: 'encode', label: '编码转换' },
    { key: 'emoji', label: 'Emoji 表情' },
    { key: 'dev', label: '开发工具' },
];

export const tools = [
    {
        id: 'json-formatter', // https://wejson.cn/
        name: 'JSON 工具大全',
        desc: '格式化/压缩/校验/排序/Tree/JSONPath/生成类型等。',
        category: 'dev',
        path: '/tools/json-formatter'
    },
    {
        id: 'url-codec',
        name: 'URL 编码/解码',
        desc: '合并 URL Encode / Decode，支持完整 URL、参数文本和表单 + 空格互转。',
        category: 'dev',
        path: '/tools/url-codec'
    },
    {
        id: 'base64',
        name: 'Base64 编解码',
        desc: '支持中文文本的 Base64 转换。',
        category: 'encode',
        path: '/tools/base64'
    },
    {
        id: 'file-encrypt',
        name: '文件加密/解密（本地）',
        desc: 'AES-256-GCM，本地浏览器加解密，不上传服务器。',
        category: 'encode',
        path: '/tools/file-encrypt'
    },
    {
        id: 'torrent-magnet',
        name: 'Torrent 转磁力链接',
        desc: '批量解析 .torrent 文件，生成磁力链接。',
        category: 'encode',
        path: '/tools/torrent-magnet'
    },
    {
        id: 'text-stats',
        name: '文本统计',
        desc: '统计字数、字符数、行数。',
        category: 'text',
        path: '/tools/text-stats'
    },
    {
        id: 'markdown-editor',
        name: 'Markdown 在线编辑器',
        desc: '实时预览、导入导出、常用语法工具栏。',
        category: 'text',
        path: '/tools/markdown-editor'
    },
    {
        id: 'text-letter',
        name: '文本加密为字母',
        desc: '在文本与字母密文之间转换。',
        category: 'text',
        path: '/tools/text-letter'
    },
    {
        id: 'txt-diff',
        name: '文本内容对比',
        desc: '对比两段文本差异，支持行级高亮显示。',
        category: 'text',
        path: '/tools/txt-diff'
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
    },
    {
        id: 'svg-base64',
        name: 'SVG 转 Base64',
        desc: '将 SVG 转为 Base64 / Data URI，并支持预览与复制。',
        category: 'image',
        path: '/tools/svg-base64'
    },
    {
        id: 'svg-path',
        name: 'SVG Path 预览',
        desc: '粘贴 path 的 d 或 <path>，自动计算 viewBox 并预览。',
        category: 'image',
        path: '/tools/svg-path'
    },
    {
        id: 'svg-preview',
        name: 'SVG 图片预览',
        desc: '粘贴/导入 SVG 代码，实时预览并支持下载。',
        category: 'image',
        path: '/tools/svg-preview'
    },
    {
        id: 'webshot',
        name: '网页整页截图',
        desc: '输入网址，生成高清全页截图，支持 PNG/PDF 下载。',
        category: 'image',
        path: '/tools/webshot'
    },
    {
        id: 'video-to-gif',
        name: '视频转 GIF / WebP（多线程）',
        desc: '本地视频转 GIF 或 Animated WebP，多线程版本，速度更快。',
        category: 'video',
        path: '/tools/video-to-gif'
    },
    {
        id: 'video-to-gif-single',
        name: '视频转 GIF / WebP（单线程）',
        desc: '本地视频转 GIF 或 Animated WebP，单线程版本，兼容要求更低。',
        category: 'video',
        path: '/tools/video-to-gif-single'
    },
    {
        id: 'md5',
        name: '文件 MD5 批量计算',
        desc: '纯本地批量计算文件 MD5，支持拖拽、多选和复制结果。',
        category: 'encode',
        path: '/tools/md5'
    },
    {
        id: 'emoji-list',
        name: 'Emoji 全量列表',
        desc: '全量 Emoji，支持中文搜索、分组浏览和点击复制。',
        category: 'emoji',
        path: '/tools/emoji'
    },
    {
        id: 'emoji-topics',
        name: 'Emoji 专题合集',
        desc: '按节日、场景和内容主题整理 Emoji，适合运营与设计快速取用。',
        category: 'emoji',
        path: '/tools/emoji/topics'
    }
];

export const featuredToolIds = [
    'torrent-magnet',
    'text-letter',
    'unlock-pdf',
    'image-convert',
    'file-encrypt',
    'webshot',
];
