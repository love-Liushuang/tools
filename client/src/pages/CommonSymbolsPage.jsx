import { useCallback, useMemo, useState } from 'react';
import ToolPageShell from '../components/ToolPageShell';
import { useToast } from '../components/ToastProvider';
import { copyText } from '../lib/tool';

const SYMBOL_CATEGORIES = [
  { key: 'all', label: '全部' },
  { key: 'office', label: '公文括号' },
  { key: 'number', label: '编号序号' },
  { key: 'check', label: '校对标记' },
  { key: 'math', label: '数学运算' },
  { key: 'arrow', label: '箭头方向' },
  { key: 'unit', label: '单位货币' },
  { key: 'punctuation', label: '排版标点' },
  { key: 'legal', label: '版权文书' },
  { key: 'greek', label: '希腊字母' }
];

const SYMBOL_ITEMS = [
  { category: 'number', value: '①', name: '带圈数字一', usage: '主要用于清单序号、操作步骤和合同条款编号。', keywords: '序号 编号 步骤 一 圆圈' },
  { category: 'number', value: '②', name: '带圈数字二', usage: '主要用于清单序号、操作步骤和合同条款编号。', keywords: '序号 编号 步骤 二 圆圈' },
  { category: 'number', value: '③', name: '带圈数字三', usage: '主要用于清单序号、操作步骤和合同条款编号。', keywords: '序号 编号 步骤 三 圆圈' },
  { category: 'number', value: '④', name: '带圈数字四', usage: '主要用于清单序号、操作步骤和合同条款编号。', keywords: '序号 编号 步骤 四 圆圈' },
  { category: 'number', value: '⑤', name: '带圈数字五', usage: '主要用于清单序号、操作步骤和合同条款编号。', keywords: '序号 编号 步骤 五 圆圈' },
  { category: 'number', value: '⑥', name: '带圈数字六', usage: '主要用于清单序号、操作步骤和合同条款编号。', keywords: '序号 编号 步骤 六 圆圈' },
  { category: 'number', value: '⑦', name: '带圈数字七', usage: '主要用于清单序号、操作步骤和合同条款编号。', keywords: '序号 编号 步骤 七 圆圈' },
  { category: 'number', value: '⑧', name: '带圈数字八', usage: '主要用于清单序号、操作步骤和合同条款编号。', keywords: '序号 编号 步骤 八 圆圈' },
  { category: 'number', value: '⑨', name: '带圈数字九', usage: '主要用于清单序号、操作步骤和合同条款编号。', keywords: '序号 编号 步骤 九 圆圈' },
  { category: 'number', value: '⑩', name: '带圈数字十', usage: '主要用于清单序号、操作步骤和合同条款编号。', keywords: '序号 编号 步骤 十 圆圈' },
  { category: 'number', value: 'Ⅰ', name: '罗马数字一', usage: '主要用于章节层级、附录编号和正式文档目录。', keywords: '罗马数字 章节 附录 编号 一' },
  { category: 'number', value: 'Ⅱ', name: '罗马数字二', usage: '主要用于章节层级、附录编号和正式文档目录。', keywords: '罗马数字 章节 附录 编号 二' },
  { category: 'number', value: 'Ⅲ', name: '罗马数字三', usage: '主要用于章节层级、附录编号和正式文档目录。', keywords: '罗马数字 章节 附录 编号 三' },
  { category: 'number', value: 'Ⅳ', name: '罗马数字四', usage: '主要用于章节层级、附录编号和正式文档目录。', keywords: '罗马数字 章节 附录 编号 四' },
  { category: 'number', value: 'Ⅴ', name: '罗马数字五', usage: '主要用于章节层级、附录编号和正式文档目录。', keywords: '罗马数字 章节 附录 编号 五' },
  { category: 'number', value: '㈠', name: '括号中文序号一', usage: '主要用于中文文档分级标题和事项列表。', keywords: '中文序号 标题 事项 一' },
  { category: 'number', value: '㈡', name: '括号中文序号二', usage: '主要用于中文文档分级标题和事项列表。', keywords: '中文序号 标题 事项 二' },
  { category: 'number', value: '㈢', name: '括号中文序号三', usage: '主要用于中文文档分级标题和事项列表。', keywords: '中文序号 标题 事项 三' },
  { category: 'number', value: '㈣', name: '括号中文序号四', usage: '主要用于中文文档分级标题和事项列表。', keywords: '中文序号 标题 事项 四' },
  { category: 'number', value: '㈤', name: '括号中文序号五', usage: '主要用于中文文档分级标题和事项列表。', keywords: '中文序号 标题 事项 五' },

  { category: 'office', value: '〔〕', name: '六角括号', usage: '主要用于公文编号，如“〔2026〕1号”。', keywords: '公文 编号 年号 六角括号 文件号' },
  { category: 'office', value: '【】', name: '黑方头括号', usage: '主要用于标题补充、文件分类和重点标签。', keywords: '标题 分类 标签 方头括号' },
  { category: 'office', value: '（）', name: '全角圆括号', usage: '主要用于中文正文补充说明和编号。', keywords: '中文 括号 补充 编号 全角' },
  { category: 'office', value: '［］', name: '全角方括号', usage: '主要用于引用标注、资料来源和编辑说明。', keywords: '引用 标注 来源 方括号' },
  { category: 'office', value: '｛｝', name: '全角花括号', usage: '主要用于模板占位和文档字段说明。', keywords: '模板 占位 字段 花括号' },
  { category: 'office', value: '《》', name: '书名号', usage: '主要用于书名、法规、制度和文件标题。', keywords: '书名 法规 制度 文件 标题' },
  { category: 'office', value: '〈〉', name: '单书名号', usage: '主要用于书名号内嵌标题或篇章名。', keywords: '书名 篇章 标题 单书名号' },
  { category: 'office', value: '「」', name: '直角引号', usage: '主要用于繁体排版、引用和特殊标题。', keywords: '引用 繁体 标题 引号' },
  { category: 'office', value: '『』', name: '双直角引号', usage: '主要用于直角引号内的二级引用。', keywords: '二级引用 繁体 引号' },

  { category: 'check', value: '√', name: '对号', usage: '主要用于审核通过、清单确认和表格勾选。', keywords: '对 勾 通过 确认 勾选' },
  { category: 'check', value: '×', name: '叉号', usage: '主要用于审核不通过、错误标记和排除项。', keywords: '错 叉 错误 不通过 排除 乘号' },
  { category: 'check', value: '✓', name: '轻量对勾', usage: '主要用于简洁表格、待办完成和状态标识。', keywords: '对 勾 完成 状态' },
  { category: 'check', value: '✔', name: '粗体对勾', usage: '主要用于强调完成、确认和通过状态。', keywords: '对 勾 粗体 完成 通过' },
  { category: 'check', value: '✗', name: '轻量叉号', usage: '主要用于简洁表格中的失败或否定项。', keywords: '错 叉 失败 否定' },
  { category: 'check', value: '✘', name: '粗体叉号', usage: '主要用于强调错误、驳回和不符合项。', keywords: '错 叉 驳回 不符合' },
  { category: 'check', value: '□', name: '空方框', usage: '主要用于待勾选选项、纸质表单和清单模板。', keywords: '方框 未选 表单 清单' },
  { category: 'check', value: '■', name: '实心方块', usage: '主要用于图例、状态块和视觉标记。', keywords: '方块 实心 图例 状态' },
  { category: 'check', value: '○', name: '空心圆', usage: '主要用于单选项、等级标记和表格占位。', keywords: '圆 空心 单选 等级' },
  { category: 'check', value: '●', name: '实心圆', usage: '主要用于项目符号、图例和状态标记。', keywords: '圆 实心 项目符号 图例' },
  { category: 'check', value: '◎', name: '双圆圈', usage: '主要用于重点标记、选中状态和印章式编号。', keywords: '双圆 重点 选中 标记' },

  { category: 'math', value: '±', name: '正负号', usage: '主要用于误差范围、统计结果和工程参数。', keywords: '正负 误差 参数 数学' },
  { category: 'math', value: '÷', name: '除号', usage: '主要用于算式、教程和数学说明。', keywords: '除法 算式 数学' },
  { category: 'math', value: '≈', name: '约等于', usage: '主要用于估算结果、近似值和数据说明。', keywords: '约等于 近似 估算 数据' },
  { category: 'math', value: '≠', name: '不等于', usage: '主要用于条件判断、公式说明和对比关系。', keywords: '不等于 条件 对比 公式' },
  { category: 'math', value: '≤', name: '小于等于', usage: '主要用于范围条件、规则限制和数学表达。', keywords: '小于等于 范围 条件' },
  { category: 'math', value: '≥', name: '大于等于', usage: '主要用于范围条件、规则限制和数学表达。', keywords: '大于等于 范围 条件' },
  { category: 'math', value: '∞', name: '无穷大', usage: '主要用于数学概念、极限和抽象表达。', keywords: '无穷 极限 数学' },
  { category: 'math', value: '∑', name: '求和符号', usage: '主要用于统计汇总、公式和数学文档。', keywords: '求和 汇总 公式 数学' },
  { category: 'math', value: '∏', name: '连乘符号', usage: '主要用于数学公式、概率和算法说明。', keywords: '连乘 公式 概率 算法' },
  { category: 'math', value: '∴', name: '所以', usage: '主要用于推理过程、证明和结论说明。', keywords: '所以 推理 证明 结论' },
  { category: 'math', value: '∵', name: '因为', usage: '主要用于推理过程、证明和原因说明。', keywords: '因为 推理 证明 原因' },

  { category: 'arrow', value: '→', name: '右箭头', usage: '主要用于流程方向、跳转说明和步骤关系。', keywords: '箭头 右 流程 方向' },
  { category: 'arrow', value: '←', name: '左箭头', usage: '主要用于返回方向、流程回退和对照说明。', keywords: '箭头 左 返回 方向' },
  { category: 'arrow', value: '↑', name: '上箭头', usage: '主要用于上升趋势、返回顶部和方向提示。', keywords: '箭头 上 趋势 方向' },
  { category: 'arrow', value: '↓', name: '下箭头', usage: '主要用于下降趋势、下载提示和方向说明。', keywords: '箭头 下 趋势 下载' },
  { category: 'arrow', value: '↔', name: '左右双向箭头', usage: '主要用于双向关系、互转和对照说明。', keywords: '双向 箭头 互转 对照' },
  { category: 'arrow', value: '⇒', name: '推出箭头', usage: '主要用于逻辑推导、流程结果和规则说明。', keywords: '推出 逻辑 结果 箭头' },
  { category: 'arrow', value: '⇐', name: '反向推出箭头', usage: '主要用于反向推导、来源说明和流程回溯。', keywords: '反向 推导 来源 箭头' },
  { category: 'arrow', value: '↗', name: '右上箭头', usage: '主要用于增长趋势、跳转链接和图表标注。', keywords: '右上 增长 趋势 跳转' },
  { category: 'arrow', value: '↘', name: '右下箭头', usage: '主要用于下降趋势、流向标记和图表标注。', keywords: '右下 下降 趋势 流向' },

  { category: 'unit', value: '¥', name: '人民币符号', usage: '主要用于金额、报价和财务表格。', keywords: '人民币 金额 报价 财务' },
  { category: 'unit', value: '€', name: '欧元符号', usage: '主要用于外币金额、报价和合同附件。', keywords: '欧元 外币 金额 报价' },
  { category: 'unit', value: '£', name: '英镑符号', usage: '主要用于外币金额、报价和合同附件。', keywords: '英镑 外币 金额 报价' },
  { category: 'unit', value: '℃', name: '摄氏度', usage: '主要用于温度记录、实验数据和设备参数。', keywords: '摄氏度 温度 参数 实验' },
  { category: 'unit', value: '℉', name: '华氏度', usage: '主要用于海外温度记录和设备说明。', keywords: '华氏度 温度 海外 参数' },
  { category: 'unit', value: '‰', name: '千分号', usage: '主要用于费率、比例和统计指标。', keywords: '千分号 费率 比例 统计' },
  { category: 'unit', value: '㎡', name: '平方米', usage: '主要用于面积、房产、工程和装修文档。', keywords: '平方米 面积 房产 工程' },
  { category: 'unit', value: '㎥', name: '立方米', usage: '主要用于体积、工程量和物流说明。', keywords: '立方米 体积 工程 物流' },
  { category: 'unit', value: '㎏', name: '千克', usage: '主要用于重量、商品参数和物流清单。', keywords: '千克 重量 商品 物流' },
  { category: 'unit', value: '㎜', name: '毫米', usage: '主要用于尺寸、工程图纸和产品规格。', keywords: '毫米 尺寸 图纸 规格' },
  { category: 'unit', value: '㎝', name: '厘米', usage: '主要用于尺寸、产品规格和版面说明。', keywords: '厘米 尺寸 规格' },
  { category: 'unit', value: '㎞', name: '千米', usage: '主要用于距离、路线和里程说明。', keywords: '千米 距离 里程 路线' },

  { category: 'punctuation', value: '·', name: '间隔号', usage: '主要用于人名分隔、品牌名和并列词组。', keywords: '间隔号 人名 品牌 分隔' },
  { category: 'punctuation', value: '•', name: '项目符号', usage: '主要用于列表、要点和简洁排版。', keywords: '项目符号 列表 要点' },
  { category: 'punctuation', value: '…', name: '省略号', usage: '主要用于中文正文省略、引文删节和语气停顿。', keywords: '省略号 省略 引文 语气' },
  { category: 'punctuation', value: '—', name: '破折号', usage: '主要用于解释说明、转折和补充内容。', keywords: '破折号 解释 转折 补充' },
  { category: 'punctuation', value: '～', name: '全角波浪线', usage: '主要用于范围、语气和轻量连接。', keywords: '波浪线 范围 语气 连接' },
  { category: 'punctuation', value: '“”', name: '中文双引号', usage: '主要用于中文引用、强调和对话内容。', keywords: '引号 引用 对话 强调' },
  { category: 'punctuation', value: '‘’', name: '中文单引号', usage: '主要用于双引号内嵌引用和特殊称谓。', keywords: '单引号 引用 称谓' },
  { category: 'punctuation', value: '——', name: '双破折号', usage: '主要用于中文排版中的解释和插入语。', keywords: '双破折号 解释 插入语' },

  { category: 'legal', value: '№', name: '编号符号', usage: '主要用于编号、票据号和档案号前缀。', keywords: '编号 号码 票据 档案' },
  { category: 'legal', value: '§', name: '章节符号', usage: '主要用于法律条款、章节编号和引用标注。', keywords: '章节 法律 条款 引用' },
  { category: 'legal', value: '©', name: '版权符号', usage: '主要用于版权声明、作品归属和页脚信息。', keywords: '版权 声明 作品' },
  { category: 'legal', value: '®', name: '注册商标', usage: '主要用于已注册商标、品牌材料和产品说明。', keywords: '注册商标 品牌 产品' },
  { category: 'legal', value: '™', name: '商标符号', usage: '主要用于商标声明、品牌标识和宣传材料。', keywords: '商标 品牌 宣传' },
  { category: 'legal', value: '※', name: '参考标记', usage: '主要用于备注、提示和附注起始符。', keywords: '备注 提示 附注 参考' },
  { category: 'legal', value: '★', name: '实心星号', usage: '主要用于重点、评分和推荐标记。', keywords: '星号 重点 评分 推荐' },
  { category: 'legal', value: '☆', name: '空心星号', usage: '主要用于评分、收藏和轻量重点标记。', keywords: '星号 评分 收藏 重点' },

  { category: 'greek', value: 'α', name: 'Alpha 小写', usage: '主要用于数学变量、版本代号和技术文档。', keywords: 'alpha 希腊 数学 变量' },
  { category: 'greek', value: 'β', name: 'Beta 小写', usage: '主要用于测试版本、数学变量和技术文档。', keywords: 'beta 希腊 测试 变量' },
  { category: 'greek', value: 'γ', name: 'Gamma 小写', usage: '主要用于数学、物理和技术参数。', keywords: 'gamma 希腊 数学 物理' },
  { category: 'greek', value: 'δ', name: 'Delta 小写', usage: '主要用于变化量、数学变量和技术参数。', keywords: 'delta 变化量 希腊 数学' },
  { category: 'greek', value: 'θ', name: 'Theta 小写', usage: '主要用于角度、数学变量和工程公式。', keywords: 'theta 角度 希腊 工程' },
  { category: 'greek', value: 'λ', name: 'Lambda 小写', usage: '主要用于波长、函数表达和技术文档。', keywords: 'lambda 波长 函数 希腊' },
  { category: 'greek', value: 'μ', name: 'Mu 小写', usage: '主要用于微量单位、统计和技术参数。', keywords: 'mu 微 统计 参数 希腊' },
  { category: 'greek', value: 'π', name: 'Pi 小写', usage: '主要用于圆周率、数学公式和教学材料。', keywords: 'pi 圆周率 数学 希腊' },
  { category: 'greek', value: 'Ω', name: 'Omega 大写', usage: '主要用于电阻单位、物理和工程文档。', keywords: 'omega 欧姆 电阻 物理 希腊' },
  { category: 'greek', value: 'Δ', name: 'Delta 大写', usage: '主要用于变化量、差值和图表标记。', keywords: 'delta 差值 变化量 图表 希腊' }
];

const DEFAULT_FOCUS_CATEGORY = 'office';

function getSymbolId(item, index) {
  return `${item.category}-${index}`;
}

function getDefaultSelectedId() {
  const defaultIndex = SYMBOL_ITEMS.findIndex((item) => item.category === DEFAULT_FOCUS_CATEGORY);
  if (defaultIndex < 0) {
    return '';
  }

  return getSymbolId(SYMBOL_ITEMS[defaultIndex], defaultIndex);
}

function normalizeSymbolText(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '');
}

function getUnicodeText(value) {
  return Array.from(value)
    .map((char) => `U+${char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`)
    .join(' ');
}

function getCategoryLabel(categoryKey) {
  return SYMBOL_CATEGORIES.find((item) => item.key === categoryKey)?.label || '其他';
}

function CommonSymbolsPage() {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [selectedId, setSelectedId] = useState(getDefaultSelectedId);
  const toast = useToast();

  const symbolItems = useMemo(() => {
    return SYMBOL_ITEMS.map((item, index) => ({
      ...item,
      id: getSymbolId(item, index),
      categoryLabel: getCategoryLabel(item.category),
      unicode: getUnicodeText(item.value),
      searchIndex: normalizeSymbolText(`${item.value} ${item.name} ${item.usage} ${item.keywords}`)
    }));
  }, []);

  const normalizedQuery = normalizeSymbolText(query);

  const categoryCounts = useMemo(() => {
    const counts = new Map(SYMBOL_CATEGORIES.map((category) => [category.key, 0]));

    symbolItems.forEach((item) => {
      counts.set(item.category, (counts.get(item.category) || 0) + 1);
      counts.set('all', (counts.get('all') || 0) + 1);
    });

    return counts;
  }, [symbolItems]);

  const filteredItems = useMemo(() => {
    return symbolItems.filter((item) => {
      if (activeCategory !== 'all' && item.category !== activeCategory) {
        return false;
      }

      if (normalizedQuery && !item.searchIndex.includes(normalizedQuery)) {
        return false;
      }

      return true;
    });
  }, [activeCategory, normalizedQuery, symbolItems]);

  const sectionList = useMemo(() => {
    return SYMBOL_CATEGORIES
      .filter((category) => category.key !== 'all')
      .map((category) => ({
        ...category,
        items: filteredItems.filter((item) => item.category === category.key)
      }))
      .filter((section) => section.items.length > 0);
  }, [filteredItems]);

  const selectedSymbol = useMemo(() => {
    const visibleSelected = filteredItems.find((item) => item.id === selectedId);
    return visibleSelected || filteredItems[0] || symbolItems[0];
  }, [filteredItems, selectedId, symbolItems]);

  const handleCopy = useCallback(async (item) => {
    if (!item) {
      return;
    }

    setSelectedId(item.id);
    const ok = await copyText(item.value);
    if (ok) {
      toast.success(`已复制 ${item.value}`);
    } else {
      toast.error('复制失败，请手动复制。');
    }
  }, [toast]);

  const handleCopyCode = useCallback(async (item) => {
    if (!item) {
      return;
    }

    setSelectedId(item.id);
    const ok = await copyText(item.unicode);
    if (ok) {
      toast.success(`已复制编码 ${item.unicode}`);
    } else {
      toast.error('复制失败，请手动复制。');
    }
  }, [toast]);

  const handleReset = () => {
    setQuery('');
    setActiveCategory('all');
  };

  return (
    <ToolPageShell
      title="常用符号"
      desc="办公、文档和排版中常见但键盘不易输入的符号集合。"
    >
      <div className="symbol-shell">
        <div className="symbol-hero">
          <div>
            <span className="symbol-kicker">Word / WPS 常用符号</span>
            <h2>符号快捷库</h2>
          </div>

          <div className="symbol-stats-grid">
            <div className="symbol-stat-item">
              <span>符号总数</span>
              <strong>{symbolItems.length}</strong>
            </div>
            <div className="symbol-stat-item">
              <span>分类数量</span>
              <strong>{SYMBOL_CATEGORIES.length - 1}</strong>
            </div>
            <div className="symbol-stat-item">
              <span>当前结果</span>
              <strong>{filteredItems.length}</strong>
            </div>
          </div>
        </div>

        <div className="symbol-toolbar">
          <label className="field-block symbol-search-field">
            <span>搜索符号</span>
            <div className="symbol-search-input-row">
              <input
                type="text"
                value={query}
                placeholder="输入 ①、公文、对号、平方米、arrow、omega..."
                onChange={(event) => setQuery(event.target.value)}
              />
              <button
                type="button"
                className="btn-ghost"
                onClick={handleReset}
                disabled={!query && activeCategory === 'all'}
              >
                重置
              </button>
            </div>
          </label>
        </div>

        <div className="symbol-category-bar">
          {SYMBOL_CATEGORIES.map((category) => (
            <button
              key={category.key}
              type="button"
              className={activeCategory === category.key ? 'symbol-category-pill active' : 'symbol-category-pill'}
              onClick={() => setActiveCategory(category.key)}
            >
              {category.label}
              <span>{categoryCounts.get(category.key) || 0}</span>
            </button>
          ))}
        </div>

        {selectedSymbol ? (
          <div className="symbol-focus-card">
            <button
              type="button"
              className="symbol-focus-char"
              onClick={() => handleCopy(selectedSymbol)}
              title={`复制 ${selectedSymbol.value}`}
            >
              {selectedSymbol.value}
            </button>
            <div className="symbol-focus-content">
              <div className="symbol-focus-head">
                <span>{selectedSymbol.categoryLabel}</span>
                <strong>{selectedSymbol.name}</strong>
              </div>
              <p>{selectedSymbol.usage}</p>
              <div className="symbol-code-line">{selectedSymbol.unicode}</div>
            </div>
            <div className="symbol-focus-actions">
              <button type="button" className="primary" onClick={() => handleCopy(selectedSymbol)}>
                复制符号
              </button>
              <button type="button" className="btn-ghost" onClick={() => handleCopyCode(selectedSymbol)}>
                复制编码
              </button>
            </div>
          </div>
        ) : null}

        {!filteredItems.length ? (
          <div className="symbol-empty">
            没有匹配的符号，试试搜索用途、名称或符号本身。
          </div>
        ) : null}

        {!!filteredItems.length && (
          <div className="symbol-section-list">
            {sectionList.map((section) => (
              <section key={section.key} className="symbol-section">
                <div className="symbol-section-head">
                  <h3>{section.label}</h3>
                  <span>{section.items.length} 个</span>
                </div>
                <div className="symbol-grid">
                  {section.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={selectedSymbol?.id === item.id ? 'symbol-card active' : 'symbol-card'}
                      onClick={() => handleCopy(item)}
                    >
                      <span className="symbol-card-char">{item.value}</span>
                      <span className="symbol-card-name">{item.name}</span>
                      <span className="symbol-card-usage">{item.usage}</span>
                      <span className="symbol-card-code">{item.unicode}</span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </ToolPageShell>
  );
}

export default CommonSymbolsPage;
