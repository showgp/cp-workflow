import type { TableField, PlaceholderLayer } from '../../shared/types';

export interface MappingEntry {
  id: string;
  columnIndex: number;
  columnName: string;
  columnType: 'text' | 'image';
  targetLayerId: string;
  targetLayerName: string;
  targetLayerPath: string;
}

export type RowState = 'empty' | 'partial' | 'complete' | 'error';

export interface MappingRowCallbacks {
  onDelete: (id: string) => void;
  onColumnChange: (id: string, columnIndex: number) => void;
  onLayerChange: (id: string, layerId: string) => void;
  getUnmappedFields: () => TableField[];
  getUnmappedLayers: (columnType?: string) => PlaceholderLayer[];
  getMappedLayers: () => Set<string>;
  getMappedColumns: () => Set<number>;
}

let rowIdCounter = 0;

export function createMappingEntry(): MappingEntry {
  return {
    id: 'row_' + (++rowIdCounter) + '_' + Date.now(),
    columnIndex: -1,
    columnName: '',
    columnType: 'text',
    targetLayerId: '',
    targetLayerName: '',
    targetLayerPath: '',
  };
}

export function createMappingRow(
  entry: MappingEntry,
  callbacks: MappingRowCallbacks,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'mapping-row';
  row.dataset.rowId = entry.id;

  const sourceSelect = document.createElement('select');
  sourceSelect.className = 'mapping-select mapping-select-source';
  sourceSelect.innerHTML = '<option value="">请选择列…</option>';
  populateSourceOptions(sourceSelect, entry, callbacks);

  const arrow = document.createElement('span');
  arrow.className = 'mapping-arrow';
  arrow.textContent = '→';

  const targetSelect = document.createElement('select');
  targetSelect.className = 'mapping-select mapping-select-target';
  targetSelect.innerHTML = '<option value="">请选择图层…</option>';
  populateTargetOptions(targetSelect, entry, callbacks);

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'mapping-delete-btn';
  deleteBtn.textContent = '×';
  deleteBtn.addEventListener('click', () => callbacks.onDelete(entry.id));

  sourceSelect.addEventListener('change', () => {
    const idx = parseInt(sourceSelect.value);
    callbacks.onColumnChange(entry.id, isNaN(idx) ? -1 : idx);
  });

  targetSelect.addEventListener('change', () => {
    callbacks.onLayerChange(entry.id, targetSelect.value);
  });

  row.appendChild(sourceSelect);
  row.appendChild(arrow);
  row.appendChild(targetSelect);
  row.appendChild(deleteBtn);

  return row;
}

export function updateMappingRow(
  row: HTMLElement,
  entry: MappingEntry,
  callbacks: MappingRowCallbacks,
): void {
  const sourceSelect = row.querySelector('.mapping-select-source') as HTMLSelectElement;
  const targetSelect = row.querySelector('.mapping-select-target') as HTMLSelectElement;

  if (sourceSelect) {
    populateSourceOptions(sourceSelect, entry, callbacks);
    sourceSelect.value = entry.columnIndex >= 0 ? String(entry.columnIndex) : '';
  }

  if (targetSelect) {
    populateTargetOptions(targetSelect, entry, callbacks);
    targetSelect.value = entry.targetLayerId || '';
  }

  const state = getRowState(entry);
  row.className = 'mapping-row mapping-row-' + state;
}

function getRowState(entry: MappingEntry): RowState {
  const hasCol = entry.columnIndex >= 0;
  const hasLayer = !!entry.targetLayerId;
  if (!hasCol && !hasLayer) return 'empty';
  if (!hasCol || !hasLayer) return 'partial';
  return 'complete';
}

function populateSourceOptions(
  select: HTMLSelectElement,
  entry: MappingEntry,
  callbacks: MappingRowCallbacks,
): void {
  select.innerHTML = '<option value="">请选择列…</option>';
  const fields = callbacks.getUnmappedFields();
  const mappedColumns = callbacks.getMappedColumns();

  for (const field of fields) {
    if (mappedColumns.has(field.index) && field.index !== entry.columnIndex) continue;
    const typeLabel = field.type === 'text' ? '文本' : '图片';
    const option = document.createElement('option');
    option.value = String(field.index);
    option.textContent = field.name + ' (' + typeLabel + ')';
    select.appendChild(option);
  }

  if (entry.columnIndex >= 0) {
    const selectedOption = select.querySelector(`option[value="${entry.columnIndex}"]`);
    if (!selectedOption) {
      const opt = document.createElement('option');
      opt.value = String(entry.columnIndex);
      opt.textContent = entry.columnName + ' (' + (entry.columnType === 'text' ? '文本' : '图片') + ')';
      select.appendChild(opt);
    }
  }
}

function populateTargetOptions(
  select: HTMLSelectElement,
  entry: MappingEntry,
  callbacks: MappingRowCallbacks,
): void {
  select.innerHTML = '<option value="">请选择图层…</option>';

  const columnType = entry.columnIndex >= 0 ? entry.columnType : undefined;
  const layers = callbacks.getUnmappedLayers(columnType);
  const mappedLayers = callbacks.getMappedLayers();

  for (const layer of layers) {
    if (mappedLayers.has(layer.id) && layer.id !== entry.targetLayerId) continue;
    const typeLabel = layer.layerType === 'text' ? '文本' : '图片';
    const option = document.createElement('option');
    option.value = layer.id;
    option.textContent = layer.path + ' (' + typeLabel + ')';
    select.appendChild(option);
  }

  if (entry.targetLayerId) {
    const selectedOption = select.querySelector(`option[value="${entry.targetLayerId}"]`);
    if (!selectedOption) {
      const opt = document.createElement('option');
      opt.value = entry.targetLayerId;
      opt.textContent = entry.targetLayerPath || entry.targetLayerName;
      select.appendChild(opt);
    }
  }

  if (select.options.length <= 1) {
    select.disabled = true;
    select.innerHTML = '<option value="">无可用图层</option>';
  } else {
    select.disabled = false;
  }
}
