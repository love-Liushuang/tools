import { useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_INVOICE_TYPE, INVOICE_TYPES } from '../lib/invoicePdf';
import {
  createDefaultLedgerFieldSelection,
  getInvoiceLedgerFieldOptions,
  normalizeLedgerFieldSelection,
  normalizeLedgerFieldSelectionMap
} from '../lib/invoiceLedger';

function buildOrderedFields(fields, selectedKeys) {
  const selectedSet = new Set(selectedKeys);
  return [...fields].sort((left, right) => {
    const leftIndex = selectedKeys.indexOf(left.key);
    const rightIndex = selectedKeys.indexOf(right.key);

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
}

function InvoiceLedgerFieldsModal({
  initialInvoiceTypeKey,
  initialSelectionMap,
  onSave,
  onCancel
}) {
  const [localType, setLocalType] = useState(initialInvoiceTypeKey || DEFAULT_INVOICE_TYPE);
  const [selectionMap, setSelectionMap] = useState(() => normalizeLedgerFieldSelectionMap(initialSelectionMap));
  const [orderedFields, setOrderedFields] = useState(() => {
    const startType = initialInvoiceTypeKey || DEFAULT_INVOICE_TYPE;
    const selectedKeys = normalizeLedgerFieldSelection(initialSelectionMap?.[startType], startType);
    return buildOrderedFields(getInvoiceLedgerFieldOptions(startType), selectedKeys);
  });
  const dragIndexRef = useRef(null);
  const selectedKeys = useMemo(
    () => normalizeLedgerFieldSelection(selectionMap?.[localType], localType),
    [localType, selectionMap]
  );
  const allFields = useMemo(
    () => getInvoiceLedgerFieldOptions(localType),
    [localType]
  );

  useEffect(() => {
    const nextType = initialInvoiceTypeKey || DEFAULT_INVOICE_TYPE;
    const nextSelectionMap = normalizeLedgerFieldSelectionMap(initialSelectionMap);
    setLocalType(nextType);
    setSelectionMap(nextSelectionMap);
    setOrderedFields(buildOrderedFields(
      getInvoiceLedgerFieldOptions(nextType),
      normalizeLedgerFieldSelection(nextSelectionMap[nextType], nextType)
    ));
  }, [initialInvoiceTypeKey, initialSelectionMap]);

  useEffect(() => {
    setOrderedFields(buildOrderedFields(allFields, selectedKeys));
  }, [allFields, selectedKeys]);

  function toggleField(key) {
    setSelectionMap((prev) => {
      const currentSelectedKeys = normalizeLedgerFieldSelection(prev?.[localType], localType);
      const nextSelectedKeys = currentSelectedKeys.includes(key)
        ? currentSelectedKeys.filter((item) => item !== key)
        : [...currentSelectedKeys, key];

      return {
        ...prev,
        [localType]: nextSelectedKeys
      };
    });
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

    onSave?.({
      invoiceTypeKey: localType,
      selectionMap: {
        ...normalizeLedgerFieldSelectionMap(selectionMap),
        [localType]: orderedSelectedKeys.length
          ? orderedSelectedKeys
          : createDefaultLedgerFieldSelection(localType)
      }
    });
  }

  return (
    <div className="invoice-modal-overlay">
      <div className="invoice-panel" style={{ width: '65vw' }}>
        <div className="invoice-panel-head">
          <div>
            <h3>导出字段设置</h3>
            <p style={{ marginTop: 8, color: '#58718a' }}>可按发票类型分别配置导出字段，并拖拽调整 Excel 列顺序。</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
          <label className="invoice-separator-field" style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 700 }}>
            <span>发票类型</span>
            <select value={localType} onChange={(event) => setLocalType(event.target.value)}>
              {INVOICE_TYPES.map((type) => (
                <option key={type.key} value={type.key}>{type.label}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="invoice-preview-box" style={{ marginTop: 8 }}>
          <span>当前已选</span>
          <strong>{selectedKeys.length} 列</strong>
        </div>

        <div style={{ marginTop: 8, color: '#6b829a', fontSize: 13 }}>提示：当前仅展示所选发票类型可导出的字段，勾选后才会导出，已选字段支持拖拽排序。</div>
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
