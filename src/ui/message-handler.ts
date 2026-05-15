import type { SandboxToUiMessage } from '../shared/messages';
import type { SelectionInfo, PlaceholderLayer } from '../shared/types';
import { renderLayerList, updateTemplateStatus, clearLayerList } from './layer-list';

let onGenerateEnabledChange: ((enabled: boolean) => void) | null = null;

export function setGenerateEnabledCallback(cb: (enabled: boolean) => void): void {
  onGenerateEnabledChange = cb;
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
      break;
    case 'generation-complete':
      break;
    case 'generation-cancelled':
      break;
    case 'generation-error':
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
  if (!node.isFrame) {
    updateTemplateStatus('not-frame', node.type);
    clearLayerList();
    notifyTemplateReady(false);
    return;
  }
}

function handleTemplateLayers(payload: {
  nodeId: string;
  frameName: string;
  textLayers: PlaceholderLayer[];
  imageLayers: PlaceholderLayer[];
  totalLayers: number;
}): void {
  updateTemplateStatus('valid', payload.frameName);

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
