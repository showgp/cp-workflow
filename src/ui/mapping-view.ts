export { createMappingPanel } from './mapping/MappingPanel';
export { createMappingEntry } from './mapping/MappingRow';
export type { MappingEntry } from './mapping/MappingRow';
export type { MappingPanelCallbacks } from './mapping/MappingPanel';

// Stub functions for backward compatibility
export function getCurrentMappings(): unknown[] {
  throw new Error('Use MappingPanel.getEntries() instead');
}

export function clearAllMappings(): void {
  throw new Error('Use MappingPanel.clearAll() instead');
}

export function hasAnyMapping(): boolean {
  throw new Error('Use MappingPanel.hasAnyMapping() instead');
}

export function setMappingChangeCallback(_callback: (mappings: unknown[]) => void): void {
  throw new Error('Use MappingPanelCallbacks.onMappingsChanged instead');
}
