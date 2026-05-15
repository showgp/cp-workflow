// Cell values
export type CellValue = string | ImageData | null;

export type FieldType = 'text' | 'image';

// Image data from Excel embedded images
export interface ImageData {
  name: string;
  dataUrl: string;
  mimeType: string;
  byteSize: number;
}

// Table field (column) definition
export interface TableField {
  name: string;
  index: number;
  type: FieldType;
  sample: string;
}

// Table row
export interface TableRow {
  index: number;
  cells: Record<string, CellValue>;
}

// Source table from parsed Excel/CSV
export interface SourceTable {
  fields: TableField[];
  rows: TableRow[];
  fileName: string;
  fileExtension: string;
  totalRows: number;
  totalColumns: number;
}

// Layer types
export type LayerType = 'text' | 'image' | 'other';

// Layer info from template scanning
interface LayerInfo {
  id: string;
  name: string;
  nodeType: string;
  path: string;
  currentContent: string;
  layerType: LayerType;
}

// Placeholder layer (only text/image, filtered out 'other')
export interface PlaceholderLayer extends LayerInfo {
  layerType: 'text' | 'image';
}

// Mapping entry
export interface MappingEntry {
  id: string;
  sourceField: string;
  sourceFieldType: FieldType;
  targetLayerId: string;
  targetLayerName: string;
  targetLayerType: 'text' | 'image';
}

// Mapping config
export interface MappingConfig {
  entries: MappingEntry[];
  templateNodeId: string;
  templateName: string;
  createdAt: number;
  updatedAt: number;
}

// Layout settings
export interface LayoutSettings {
  columns: number;
  horizontalGap: number;
  verticalGap: number;
}

// Generation config sent from UI to Sandbox
export interface GenerationConfig {
  mapping: MappingConfig;
  sourceTable: SourceTable;
  templatePreviewDataUrl: string | null;
  layout: LayoutSettings;
}

// Generation status
export type GenerationStatus = 'running' | 'cancelling' | 'cancelled';

// Generation progress
export interface GenerationProgress {
  current: number;
  total: number;
  status: GenerationStatus;
  currentRowIndex: number;
}

// Issue (empty cell in mapped field)
export interface Issue {
  rowIndex: number;
  fieldName: string;
  layerName: string;
  message: string;
}

// Warning (non-blocking, e.g. image extraction failed)
export interface Warning {
  rowIndex: number;
  fieldName: string;
  message: string;
}

// Generation result
export interface GenerationResult {
  successCount: number;
  issueCount: number;
  totalRows: number;
  issues: Issue[];
  warnings: Warning[];
  startTime: number;
  endTime: number;
}

// Selection info
export interface SelectedNodeSummary {
  id: string;
  name: string;
  type: string;
  isFrame: boolean;
}

export interface SelectionInfo {
  hasSelection: boolean;
  selectionCount: number;
  selectedNodes: SelectedNodeSummary[];
}
