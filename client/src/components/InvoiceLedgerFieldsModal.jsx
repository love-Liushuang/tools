import { useEffect, useRef, useState } from 'react';
import { DEFAULT_LEDGER_FIELD_KEYS, getInvoiceLedgerFieldOptions } from '../lib/invoiceLedger';

function InvoiceLedgerFieldsModal({ initialSelectedKeys, onSave, onCancel }) {
  const allFields = getInvoiceLedgerFieldOptions();
  const [selectedKeys, setSelectedKeys] = useState(initialSelectedKeys?.length ? initialSelectedKeys : DEFAULT_LEDGER_FIELD_KEYS);
  const [orderedFields, setOrderedFields] = useState(() => {
    const selectedSet = new Set(initialSelectedKeys?.length ? initialSelectedKeys : DEFAULT_LEDGER_FIELD_KEYS);
    return [...allFields].sort((left, right) => {
      const leftIndex = initialSelectedKeys?.indexOf(left.key) ?? -1;
      const rightIndex = initialSelectedKeys?.indexOf(right.key) ?? -1;

      if (selectedSet.has(left.key) && selectedSet.has(right.key)) {
        return leftIndex - rightIndex;
      }
      if (selectedSet.has(left.key)) {
        return -1;
      }
      if (selectedSet.has(right.key)) {
        return 1;
      }
      return 0;
    });
  });
  const dragIndexRef = useRef(null);

  useEffect(() => {
    if (initialSelectedKeys?.length) {
      setSelectedKeys(initialSelectedKeys);
    }
  }, [initialSelectedKeys]);

  function toggleField(key) {
    setSelectedKeys((prev) => (
      prev.includes(key)
        ? prev.filter((item) => item !== key)
        : [...prev, key]
    ));
  }

  function handleDrop(toIndex) {
    const fromIndex = dragIndexRef.current;
    dragIndexRef.current = null;
    if (!Number.isInteger(fromIndex) || fromIndex === toIndex) {
      return;
    }

    setOrderedFields((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }

  function handleSave() {
    const orderedSelectedKeys = orderedFields
      .map((field) => field.key)
      .filter((key) => selectedKeys.includes(key));

    onSave?.(orderedSelectedKeys);
  }

  return (
    <div className="invoice-modal-overlay">
      <div className="invoice-panel" style={{ width: '65vw' }}>
        <div className="invoice-panel-head">
          <div>
            <h3>导出字段设置</h3>
            <p style={{ marginTop: 8, color: '#58718a' }}>勾选需要导出的列，并可拖拽调整 Excel 列顺序。</p>
          </div>
        </div>

        <div className="invoice-preview-box" style={{ marginTop: 8 }}>
          <span>当前已选</span>
          <strong>{selectedKeys.length} 列</strong>
        </div>

        <div style={{ marginTop: 8, color: '#6b829a', fontSize: 13 }}>提示：勾选后才会导出，已选字段支持拖拽排序。</div>
        <div className="invoice-rule-list" style={{ marginTop: 8, overflow: 'auto' }}>
          {orderedFields.map((field, index) => {
            const checked = selectedKeys.includes(field.key);
            return (
              <div
                key={field.key}
                className="invoice-rule-row"
                draggable={checked}
                onDragStart={() => {
                  if (checked) {
                    dragIndexRef.current = index;
                  }
                }}
                onDragOver={(event) => {
                  if (checked) {
                    event.preventDefault();
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  handleDrop(index);
                }}
                title={checked ? '按住并拖拽以调整顺序' : '勾选后可拖拽排序'}
              >
                <span className="drag-handle" aria-hidden>{checked ? '≡' : ''}</span>
                <input type="checkbox" checked={checked} onChange={() => toggleField(field.key)} />
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{field.label}</div>
                  <div style={{ color: '#666', fontSize: 12 }}>{field.key}</div>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="invoice-preview-box">
            <span>列顺序预览</span>
            <strong style={{ display: 'block', marginTop: 8 }}>
              {orderedFields.filter((field) => selectedKeys.includes(field.key)).map((field) => field.label).join(' / ') || '请至少选择一列'}
            </strong>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="invoice-btn invoice-btn-ghost" type="button" onClick={onCancel}>取消</button>
            <button className="invoice-btn invoice-btn-primary" type="button" onClick={handleSave}>确认</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default InvoiceLedgerFieldsModal;
