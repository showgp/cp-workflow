import type { TableField, PlaceholderLayer } from '../../shared/types';
import { createMappingEntry, createMappingRow, updateMappingRow } from './MappingRow';
import type { MappingEntry, MappingRowCallbacks } from './MappingRow';

export interface MappingPanelCallbacks {
  onMappingsChanged: (entries: MappingEntry[]) => void;
  getSourceFields: () => TableField[];
  getTextLayers: () => PlaceholderLayer[];
  getImageLayers: () => PlaceholderLayer[];
}

export function createMappingPanel(
  container: HTMLElement,
  callbacks: MappingPanelCallbacks,
): {
  getEntries: () => MappingEntry[];
  setEntries: (entries: MappingEntry[]) => void;
  clearAll: () => void;
  hasAnyMapping: () => boolean;
  getEntryId: (entry: MappingEntry) => string;
} {
  let entries: MappingEntry[] = [];

  const rowsContainer = document.createElement('div');
  rowsContainer.className = 'mapping-rows';
  container.appendChild(rowsContainer);

  const addBtn = document.createElement('button');
  addBtn.className = 'mapping-add-btn';
  addBtn.textContent = '+ 添加映射';
  addBtn.addEventListener('click', () => addMappingRow());
  container.appendChild(addBtn);

  const summary = document.createElement('div');
  summary.className = 'mapping-summary';
  container.appendChild(summary);

  const clearBtn = document.createElement('button');
  clearBtn.className = 'mapping-clear-btn';
  clearBtn.textContent = '清除全部映射';
  clearBtn.addEventListener('click', () => clearAllMappings());
  container.appendChild(clearBtn);

  function buildCallbacks(): MappingRowCallbacks {
    return {
      onDelete: (id: string) => deleteMappingRow(id),
      onColumnChange: (id: string, columnIndex: number) => updateColumn(id, columnIndex),
      onLayerChange: (id: string, layerId: string) => updateLayer(id, layerId),
      getUnmappedFields: () => getUnmappedFields(),
      getUnmappedLayers: (columnType?: string) => getUnmappedLayers(columnType),
      getMappedLayers: () => getMappedLayerIds(),
      getMappedColumns: () => getMappedColumnIndices(),
    };
  }

  function getUnmappedFields(): TableField[] {
    const fields = callbacks.getSourceFields();
    const mapped = getMappedColumnIndices();
    return fields.filter(f => !mapped.has(f.index));
  }

  function getUnmappedLayers(columnType?: string): PlaceholderLayer[] {
    const allLayers = [
      ...callbacks.getTextLayers(),
      ...callbacks.getImageLayers(),
    ];
    const mapped = getMappedLayerIds();
    let layers = allLayers.filter(l => !mapped.has(l.id));

    if (columnType) {
      layers = layers.filter(l => l.layerType === columnType);
    }

    return layers;
  }

  function getMappedColumnIndices(): Set<number> {
    return new Set(entries.filter(e => e.columnIndex >= 0).map(e => e.columnIndex));
  }

  function getMappedLayerIds(): Set<string> {
    return new Set(entries.filter(e => !!e.targetLayerId).map(e => e.targetLayerId));
  }

  function addMappingRow(): void {
    const entry = createMappingEntry();
    entries.push(entry);
    render();
    callbacks.onMappingsChanged(entries);
  }

  function deleteMappingRow(id: string): void {
    entries = entries.filter(e => e.id !== id);
    render();
    callbacks.onMappingsChanged(entries);
  }

  function updateColumn(id: string, columnIndex: number): void {
    const entry = entries.find(e => e.id === id);
    if (!entry) return;

    const fields = callbacks.getSourceFields();
    const field = fields.find(f => f.index === columnIndex);

    if (field && columnIndex >= 0) {
      entry.columnIndex = field.index;
      entry.columnName = field.name;
      entry.columnType = field.type;
      if (entry.targetLayerId) {
        const allLayers = [...callbacks.getTextLayers(), ...callbacks.getImageLayers()];
        const targetLayer = allLayers.find(l => l.id === entry.targetLayerId);
        if (targetLayer && targetLayer.layerType !== field.type) {
          entry.targetLayerId = '';
          entry.targetLayerName = '';
          entry.targetLayerPath = '';
        }
      }
    } else {
      entry.columnIndex = -1;
      entry.columnName = '';
      entry.columnType = 'text';
      entry.targetLayerId = '';
      entry.targetLayerName = '';
      entry.targetLayerPath = '';
    }

    render();
    callbacks.onMappingsChanged(entries);
  }

  function updateLayer(id: string, layerId: string): void {
    const entry = entries.find(e => e.id === id);
    if (!entry) return;

    if (layerId) {
      const allLayers = [...callbacks.getTextLayers(), ...callbacks.getImageLayers()];
      const layer = allLayers.find(l => l.id === layerId);
      if (layer) {
        entry.targetLayerId = layer.id;
        entry.targetLayerName = layer.name;
        entry.targetLayerPath = layer.path;
      }
    } else {
      entry.targetLayerId = '';
      entry.targetLayerName = '';
      entry.targetLayerPath = '';
    }

    render();
    callbacks.onMappingsChanged(entries);
  }

  function clearAllMappings(): void {
    if (entries.length === 0) return;
    entries = [];
    render();
    callbacks.onMappingsChanged(entries);
  }

  function canAddMapping(): boolean {
    const fields = callbacks.getSourceFields();
    const allLayers = [...callbacks.getTextLayers(), ...callbacks.getImageLayers()];
    if (fields.length === 0 || allLayers.length === 0) return false;

    const unmapped = getUnmappedFields();
    if (unmapped.length === 0) return false;

    const mapped = getMappedLayerIds();
    const unmappedLayers = allLayers.filter(l => !mapped.has(l.id));
    if (unmappedLayers.length === 0) return false;

    return unmapped.some(f =>
      unmappedLayers.some(l => l.layerType === f.type),
    );
  }

  function render(): void {
    rowsContainer.innerHTML = '';

    const cb = buildCallbacks();
    for (const entry of entries) {
      const row = createMappingRow(entry, cb);
      updateMappingRow(row, entry, cb);
      rowsContainer.appendChild(row);
    }

    addBtn.disabled = !canAddMapping();

    const fields = callbacks.getSourceFields();
    const allLayers = [...callbacks.getTextLayers(), ...callbacks.getImageLayers()];

    const mappedColSet = getMappedColumnIndices();
    const mappedLayerSet = getMappedLayerIds();
    const mappedCols = mappedColSet.size;
    const unmappedCols = fields.length - mappedCols;
    const unmappedLayers = allLayers.filter(l => !mappedLayerSet.has(l.id)).length;

    summary.textContent = `已映射: ${mappedCols} 列 | 未映射: ${unmappedCols} 列 | 未映射图层: ${unmappedLayers} 个`;

    clearBtn.style.display = entries.length > 0 ? 'inline-block' : 'none';
  }

  return {
    getEntries: () => entries,
    setEntries: (newEntries: MappingEntry[]) => {
      entries = newEntries;
      render();
    },
    clearAll: () => clearAllMappings(),
    hasAnyMapping: () => entries.some(e => e.columnIndex >= 0 && e.targetLayerId),
    getEntryId: (entry: MappingEntry) => entry.id,
  };
}
