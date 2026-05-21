import type { SandboxToUiMessage } from '../shared/messages';
import type { SelectionInfo, PlaceholderLayer, GenerationProgress, GenerationResult } from '../shared/types';
import { renderLayerList, updateTemplateStatus, clearLayerList } from './layer-list';
import { updateProgress } from './progress-bar';
import { showResult, showCancelledResult, showError } from './result-view';

let onGenerateEnabledChange: ((enabled: boolean) => void) | null = null;

let onTemplateLayersReceived: ((payload: {
  nodeId: string;
  templateName: string;
  textLayers: PlaceholderLayer[];
  imageLayers: PlaceholderLayer[];
  totalLayers: number;
}) => void) | null = null;

export function setGenerateEnabledCallback(cb: (enabled: boolean) => void): void {
  onGenerateEnabledChange = cb;
}

export function setTemplateLayersCallback(cb: typeof onTemplateLayersReceived): void {
  onTemplateLayersReceived = cb;
}

function notifyTemplateReady(ready: boolean): void {
  if (onGenerateEnabledChange) onGenerateEnabledChange(ready);
}

export function messageHandler(message: SandboxToUiMessage): void {
  switch (message.type) {
    case 'selection-changed':
      handleSelectionChanged(message.payload);
      break;
    case 'template-layers':
      handleTemplateLayers(message.payload);
      break;
    case 'generation-progress':
      handleGenerationProgress(message.payload);
      break;
    case 'generation-complete':
      handleGenerationComplete(message.payload);
      break;
    case 'generation-cancelled':
      handleGenerationCancelled(message.payload);
      break;
    case 'generation-error':
      handleGenerationError(message.payload);
      break;
    default:
      break;
  }
}

function handleSelectionChanged(info: SelectionInfo): void {
  if (!info.hasSelection) {
    updateTemplateStatus('no-selection');
    clearLayerList();
    notifyTemplateReady(false);
    return;
  }

  if (info.selectionCount > 1) {
    updateTemplateStatus('multiple');
    clearLayerList();
    notifyTemplateReady(false);
    return;
  }

  const node = info.selectedNodes[0];
  if (!node.isTemplate) {
    updateTemplateStatus('not-template', node.type);
    clearLayerList();
    notifyTemplateReady(false);
    return;
  }
}

function handleTemplateLayers(payload: {
  nodeId: string;
  templateName: string;
  textLayers: PlaceholderLayer[];
  imageLayers: PlaceholderLayer[];
  totalLayers: number;
}): void {
  updateTemplateStatus('valid', payload.templateName);

  if (onTemplateLayersReceived) {
    onTemplateLayersReceived(payload);
  }

  const container = document.getElementById('layer-list-container');
  if (!container) return;

  if (payload.totalLayers === 0) {
    renderLayerList([], [], container);
    notifyTemplateReady(false);
  } else {
    renderLayerList(payload.textLayers, payload.imageLayers, container);
    notifyTemplateReady(true);
  }
}

function handleGenerationProgress(payload: GenerationProgress): void {
  updateProgress(payload);
}

function handleGenerationComplete(payload: GenerationResult): void {
  showResult(payload);
}

function handleGenerationCancelled(payload: { successCount: number; processedRows: number; totalRows: number }): void {
  showCancelledResult(payload.successCount, payload.processedRows, payload.totalRows);
}

function handleGenerationError(payload: { message: string; phase: string; rowIndex: number; detail: string }): void {
  showError(payload.message || '生成失败');
}
