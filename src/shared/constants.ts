import type { LayoutSettings } from './types';

export const SUPPORTED_FILE_EXTENSIONS = {
  XLSX: 'xlsx',
  CSV: 'csv',
} as const;

export const FILE_ACCEPT = '.xlsx,.csv';

export const DEFAULT_LAYOUT: LayoutSettings = {
  direction: 'grid',
  columns: 4,
  horizontalGap: 80,
  verticalGap: 100,
};

export const MESSAGES = {
  FILE_PARSE_ERROR: '文件解析失败：{reason}',
  FILE_TYPE_UNSUPPORTED: '不支持的文件格式，请上传 .xlsx 或 .csv 文件',
  NO_DATA_ROWS: '未检测到数据行，请检查表格是否包含有效数据',
  NO_SELECTION: '请选择一个容器节点（Frame / 实例 / 群组）作为模板',
  MULTIPLE_SELECTION: '请只选择一个容器节点（Frame / 实例 / 群组）作为模板，当前选中了多个对象',
  NOT_A_TEMPLATE: '请选择一个容器节点（Frame / 实例 / 群组）作为模板，当前选中的是 {type}',
  NO_FILLABLE_LAYERS: '模板中未检测到可填充的文本层或图片层',
  CANCEL: '取消',
  GENERATE: '生成',
} as const;
