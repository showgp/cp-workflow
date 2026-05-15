import type { MappingConfig, TableRow } from '../shared/types';

export function fillContent(_clonedFrame: FrameNode, _mapping: MappingConfig, _row: TableRow): void {
  throw new Error('Not implemented');
}

export function fillTextNode(_node: TextNode, _value: string): void {
  throw new Error('Not implemented');
}

export function fillImageNode(_node: SceneNode, _imageData: { dataUrl: string }): void {
  throw new Error('Not implemented');
}
