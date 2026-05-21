import type { LayoutSettings } from '../shared/types';
import { DEFAULT_LAYOUT } from '../shared/constants';

export function layoutNodes(nodes: SceneNode[], settings: LayoutSettings = DEFAULT_LAYOUT): void {
  if (nodes.length === 0) return;

  const firstNode = nodes[0] as SceneNode & DimensionAndPositionMixin;
  const baseX = firstNode.x;
  const baseY = firstNode.y;
  const nodeWidth = firstNode.width;
  const nodeHeight = firstNode.height;

  for (let i = 0; i < nodes.length; i++) {
    const pos = calculatePosition(i, nodeWidth, nodeHeight, settings);
    const node = nodes[i] as SceneNode & DimensionAndPositionMixin;
    node.x = baseX + pos.x;
    node.y = baseY + pos.y;
  }
}

export function calculatePosition(
  index: number,
  frameWidth: number,
  frameHeight: number,
  settings: LayoutSettings,
): { x: number; y: number } {
  const hGap = settings.horizontalGap || 80;
  const vGap = settings.verticalGap || 100;
  const direction = settings.direction || 'grid';

  let col: number;
  let row: number;

  if (direction === 'horizontal') {
    col = index;
    row = 0;
  } else if (direction === 'vertical') {
    col = 0;
    row = index;
  } else {
    const cols = settings.columns || 4;
    col = index % cols;
    row = Math.floor(index / cols);
  }

  return {
    x: col * (frameWidth + hGap),
    y: row * (frameHeight + vGap),
  };
}
