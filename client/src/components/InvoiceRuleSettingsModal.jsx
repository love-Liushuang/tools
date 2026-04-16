import React, { useEffect, useState, useRef } from 'react';
import {
  RULE_SETTINGS,
  getFieldsForInvoiceType,
  validateAndNormalizeProfile,
  buildRulePreview,
  INVOICE_TYPES,
  DEFAULT_INVOICE_TYPE,
  createDefaultRuleProfile
} from '../lib/invoicePdf';

function InvoiceRuleSettingsModal({ invoiceTypeKey, initialProfile, onSave, onCancel }) {
  const startType = invoiceTypeKey || DEFAULT_INVOICE_TYPE;
  const [localType, setLocalType] = useState(startType);
  const [profile, setProfile] = useState(() => validateAndNormalizeProfile(initialProfile || createDefaultRuleProfile(startType), startType));
  const [preview, setPreview] = useState('');
  const [dragIndex, setDragIndex] = useState(null);
  const dragOverRef = useRef(null);

  useEffect(() => {
    // when type changes, load default profile unless an explicit initialProfile was provided
    if (initialProfile && initialProfile.invoiceTypeKey === localType) {
      setProfile(validateAndNormalizeProfile(initialProfile, localType));
      return;
    }

    const defaults = createDefaultRuleProfile(localType);
    setProfile(defaults);
  }, [localType, initialProfile]);

  useEffect(() => {
    setPreview(buildRulePreview(localType, profile));
  }, [localType, profile]);

  function updateItemAt(index, updates) {
    setProfile((p) => {
      const items = [...(p.items || [])];
      items[index] = { ...items[index], ...updates };
      return { ...p, items };
    });
  }

  function toggleItemAt(index) {
    const item = profile.items[index] || {};
    updateItemAt(index, { enabled: !item.enabled });
  }

  function handleSave() {
    const normalized = validateAndNormalizeProfile(profile, localType);
    onSave && onSave(normalized);
  }

  function handleDragStart(e, index) {
    e.dataTransfer.setData('text/plain', String(index));
    setDragIndex(index);
  }

  function handleDragOver(e) {
    e.preventDefault();
    dragOverRef.current = true;
  }

  function handleDrop(e, toIndex) {
    e.preventDefault();
    const from = Number(e.dataTransfer.getData('text/plain'));
    if (Number.isNaN(from)) return;
    if (from === toIndex) return;
    setProfile((p) => {
      const items = [...(p.items || [])];
      const [moved] = items.splice(from, 1);
      items.splice(toIndex, 0, moved);
      return { ...p, items };
    });
    setDragIndex(null);
    dragOverRef.current = null;
  }

  const fieldMetas = getFieldsForInvoiceType(localType);

  return (
    <div className="invoice-modal-overlay">
      <div className="invoice-panel" style={{ width: '65vw' }}>
        <div className="invoice-panel-head">
          <div>
            <h3>文件重命名规则</h3>
            {/* <h3>文件重命名规则 - {localType}</h3> */}
            <p style={{ marginTop: 8, color: '#58718a' }}>在此为不同发票类型分别配置命名规则与优先字段。</p>
          </div>
          <div className="invoice-panel-head-status" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              发票类型
              <select value={localType} onChange={(e) => setLocalType(e.target.value)}>
                {INVOICE_TYPES.map((t) => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8 }}>
          <label className="invoice-separator-field">
            <span>分隔符</span>
            <select value={profile.separator} onChange={(e) => setProfile({ ...profile, separator: e.target.value })}>
              {RULE_SETTINGS.separatorOptions.map((o) => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
          </label>

          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={profile.showSequence} onChange={(e) => setProfile({ ...profile, showSequence: e.target.checked })} /> 显示序号
          </label>

          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={profile.showFieldLabel} onChange={(e) => setProfile({ ...profile, showFieldLabel: e.target.checked })} /> 显示字段标签
          </label>
        </div>

        <div style={{ marginTop: 8, color: '#6b829a', fontSize: 13 }}>提示：拖拽条目以调整字段顺序，鼠标悬停显示拖拽手柄。</div>
        <div className="invoice-rule-list" style={{ marginTop: 8, overflow: 'auto' }}>
          {(profile.items || []).map((item, idx) => {
            const meta = fieldMetas.find((f) => f.key === item.key) || { label: item.key, kind: 'text', sample: '' };
            return (
              <div
                key={item.key}
                className="invoice-rule-row"
                draggable
                onDragStart={(e) => handleDragStart(e, idx)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, idx)}
                title="按住并拖拽以调整顺序"
              >
                <span className="drag-handle" aria-hidden>≡</span>
                <input type="checkbox" checked={!!item.enabled} onChange={() => toggleItemAt(idx)} />
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, }}>
                  <div style={{ fontWeight: 700, whiteSpace: 'nowrap', }}>{meta.label}</div>
                  {/* <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center' }}> */}
                    {meta.kind === 'date' && (
                      <select value={item.dateMode} onChange={(e) => updateItemAt(idx, { dateMode: e.target.value })}>
                        {RULE_SETTINGS.dateModeOptions.map((m) => (
                          <option key={m.key} value={m.key}>{m.label}</option>
                        ))}
                      </select>
                    )}

                    {item.key === 'customContent' && (
                      <input placeholder="自定义文本" value={item.customText} onChange={(e) => updateItemAt(idx, { customText: e.target.value })} />
                    )}

                    <div style={{ color: '#666', fontSize: 12 }}>{meta.sample}</div>
                  {/* </div> */}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="invoice-preview-box">
            <span>命名预览</span>
            <strong style={{ display: 'block', marginTop: 8 }}>{preview}</strong>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="invoice-btn invoice-btn-ghost" type="button" onClick={onCancel}>取消</button>
            <button className="invoice-btn invoice-btn-primary" type="button" onClick={handleSave}>保存到本地</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default InvoiceRuleSettingsModal;
