import type { MappingEntry, TableRow, ImageData, Issue, Warning } from '../shared/types';
import { base64ToUint8Array } from './base64';

export function fillContent(
  clonedFrame: FrameNode,
  mappings: MappingEntry[],
  row: TableRow,
): { issues: Issue[]; warnings: Warning[] } {
  const issues: Issue[] = [];
  const warnings: Warning[] = [];

  for (const mapping of mappings) {
    if (!mapping.sourceField || !mapping.targetLayerName) continue;

    const cellValue = row.cells[mapping.sourceField];
    const targetNode = findNodeByPath(clonedFrame, mapping.targetLayerName.split(' > '));

    if (!targetNode) {
      issues.push({
        rowIndex: row.index,
        fieldName: mapping.sourceField,
        layerName: mapping.targetLayerName,
        message: `未找到目标图层「${mapping.targetLayerName}」`,
      });
      continue;
    }

    if (mapping.sourceFieldType === 'text') {
      fillTextContent(targetNode, cellValue as string, mapping, row.index, issues);
    } else if (mapping.sourceFieldType === 'image') {
      fillImageContent(targetNode, cellValue as ImageData | null, mapping, row.index, warnings);
    }
  }

  return { issues, warnings };
}

function fillTextContent(
  node: SceneNode,
  value: string | null,
  mapping: MappingEntry,
  rowIndex: number,
  issues: Issue[],
): void {
  if (!value || (typeof value === 'string' && value.trim() === '')) {
    issues.push({
      rowIndex,
      fieldName: mapping.sourceField,
      layerName: mapping.targetLayerName,
      message: `行 ${rowIndex + 1} 的字段「${mapping.sourceField}」单元格为空，保留模板原始文本`,
    });
    return;
  }

  if (node.type === 'TEXT') {
    const textNode = node as TextNode;
    textNode.characters = String(value);
  }
}

function fillImageContent(
  node: SceneNode,
  imageData: ImageData | null,
  mapping: MappingEntry,
  rowIndex: number,
  warnings: Warning[],
): void {
  if (!imageData || !imageData.dataUrl) {
    warnings.push({
      rowIndex,
      fieldName: mapping.sourceField,
      message: `行 ${rowIndex + 1} 的字段「${mapping.sourceField}」图片数据为空`,
    });
    return;
  }

  try {
    const bytes = base64ToUint8Array(imageData.dataUrl);
    const image = figma.createImage(bytes);
    const imageFill: ImagePaint = {
      type: 'IMAGE',
      scaleMode: 'FILL',
      imageHash: image.hash,
    };

    if ('fills' in node) {
      (node as GeometryMixin).fills = [imageFill];
    }
  } catch (_e) {
    warnings.push({
      rowIndex,
      fieldName: mapping.sourceField,
      message: `行 ${rowIndex + 1} 的字段「${mapping.sourceField}」图片解码失败`,
    });
  }
}

function findNodeByPath(frame: FrameNode, pathSegments: string[]): SceneNode | null {
  const searchSegments = pathSegments[0] === frame.name ? pathSegments.slice(1) : pathSegments;

  if (searchSegments.length === 0) return null;

  return findInChildren(frame, searchSegments, 0);
}

function findInChildren(
  parent: SceneNode & ChildrenMixin,
  segments: string[],
  depth: number,
): SceneNode | null {
  const targetName = segments[depth];
  const isLast = depth === segments.length - 1;

  for (const child of parent.children) {
    if (child.name === targetName) {
      if (isLast) return child;
      if ('children' in child) {
        const found = findInChildren(child as SceneNode & ChildrenMixin, segments, depth + 1);
        if (found) return found;
      }
    }
  }

  return null;
}
