import type { LayoutSettings } from './types';

export const NODE_TYPES = {
  FRAME: 'FRAME',
  GROUP: 'GROUP',
  TEXT: 'TEXT',
  RECTANGLE: 'RECTANGLE',
  ELLIPSE: 'ELLIPSE',
  COMPONENT: 'COMPONENT',
  INSTANCE: 'INSTANCE',
  VECTOR: 'VECTOR',
  LINE: 'LINE',
  POLYGON: 'POLYGON',
  STAR: 'STAR',
  BOOLEAN_OPERATION: 'BOOLEAN_OPERATION',
  SLICE: 'SLICE',
  SECTION: 'SECTION',
} as const;

export const LAYER_TYPES = {
  TEXT: 'text',
  IMAGE: 'image',
  OTHER: 'other',
} as const;

export const FIELD_TYPES = {
  TEXT: 'text',
  IMAGE: 'image',
} as const;

export const SUPPORTED_FILE_EXTENSIONS = {
  XLSX: 'xlsx',
  CSV: 'csv',
} as const;

export const FILE_ACCEPT = '.xlsx,.csv';

export const LAYER_SCAN = {
  STOP_TYPES: ['FRAME', 'COMPONENT', 'INSTANCE'] as string[],
  PATH_SEPARATOR: ' > ',
  MAX_CONTENT_PREVIEW_LENGTH: 100,
} as const;

export const DEFAULT_LAYOUT: LayoutSettings = {
  columns: 4,
  horizontalGap: 80,
  verticalGap: 100,
};

export const PERFORMANCE = {
  BATCH_SIZE: 5,
  BATCH_DELAY_MS: 50,
  PROGRESS_THROTTLE_MS: 200,
} as const;

export const MESSAGES = {
  NO_SELECTION: '请先在画布中选中一个模板 Frame',
  MULTIPLE_SELECTION: '请只选择一个 Frame 作为模板，当前选中了多个对象',
  NOT_A_FRAME: '请选择一个 Frame 作为模板，当前选中的是 {type}',
  NO_FILLABLE_LAYERS: '模板中未检测到可填充的文本层或图片层',
  FILE_PARSE_ERROR: '文件解析失败：{reason}',
  FILE_TYPE_UNSUPPORTED: '不支持的文件格式，请上传 .xlsx 或 .csv 文件',
  NO_DATA_ROWS: '未检测到数据行，请检查表格是否包含有效数据',
  NO_HEADER_ROW: '（无表头）',
  FIELD_ALREADY_MAPPED: '列「{field}」已被映射，不能重复映射到不同图层',
  LAYER_ALREADY_MAPPED: '图层「{layer}」已被映射，不能将不同列映射到同一图层',
  TYPE_MISMATCH: '列「{field}」的类型为 {fieldType}，无法映射到 {layerType} 类型的图层',
  NO_MAPPING_WARNING: '未建立任何字段映射。将生成模板副本但不替换任何内容，确认继续吗？',
  GENERATION_IN_PROGRESS: '生成中...',
  GENERATION_CANCELLED: '生成已取消',
  GENERATION_COMPLETE: '生成完成！',
  GENERATION_ERROR: '生成失败：{message}',
  RESULT_SUMMARY: '成功生成 {success} 页，{issues} 个问题行，{warnings} 个警告',
  ISSUE_EMPTY_CELL: '行 {row} 的字段「{field}」单元格为空，图层「{layer}」保留模板原始内容',
  WARNING_IMAGE_FAILED: '行 {row} 的字段「{field}」图片提取失败，对应位置保持空白',
  CANCEL: '取消',
  GENERATE: '生成',
  SCAN_TEMPLATE: '扫描模板',
  UPLOAD_FILE: '上传文件',
} as const;

export const LOG_LEVELS = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
} as const;
