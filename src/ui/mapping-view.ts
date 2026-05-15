import type { TableField } from '../shared/types';
import type { PlaceholderLayer } from '../shared/types';
import type { MappingEntry } from '../shared/types';

export function renderMappingView(
  _fields: TableField[],
  _textLayers: PlaceholderLayer[],
  _imageLayers: PlaceholderLayer[],
  _container: HTMLElement
): void {
  throw new Error('Not implemented');
}

export function getCurrentMappings(): MappingEntry[] {
  throw new Error('Not implemented');
}

export function clearAllMappings(): void {
  throw new Error('Not implemented');
}

export function hasAnyMapping(): boolean {
  throw new Error('Not implemented');
}

export function setMappingChangeCallback(_callback: (mappings: MappingEntry[]) => void): void {
  throw new Error('Not implemented');
}
