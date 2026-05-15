import type { UiToSandboxMessage, SandboxToUiMessage } from '../shared/messages';
import type { SelectionInfo, SelectedNodeSummary, PlaceholderLayer } from '../shared/types';
import { scanLayers } from './layer-scanner';

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let currentTemplateId: string | null = null;
let cachedLayers: { textLayers: PlaceholderLayer[]; imageLayers: PlaceholderLayer[] } | null = null;

function sendToUi(message: SandboxToUiMessage): void {
  figma.ui.postMessage(message);
}

function buildSelectionInfo(): SelectionInfo {
  const selection = figma.currentPage.selection;
  const selectedNodes: SelectedNodeSummary[] = [];

  for (const node of selection) {
    selectedNodes.push({
      id: node.id,
      name: node.name,
      type: node.type,
      isFrame: node.type === 'FRAME',
    });
  }

  return {
    hasSelection: selection.length > 0,
    selectionCount: selection.length,
    selectedNodes,
  };
}

function handleSelectionChange(): void {
  const selection = figma.currentPage.selection;

  if (selection.length === 0) {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    currentTemplateId = null;
    cachedLayers = null;
    sendToUi({
      type: 'selection-changed',
      payload: buildSelectionInfo(),
    });
    return;
  }

  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    processSelection();
  }, 300);
}

function processSelection(): void {
  const selection = figma.currentPage.selection;
  const selectionInfo = buildSelectionInfo();

  if (selection.length === 1 && selection[0].type === 'FRAME') {
    const frame = selection[0] as FrameNode;

    if (frame.removed) {
      sendToUi({ type: 'selection-changed', payload: selectionInfo });
      return;
    }

    if (frame.id === currentTemplateId && cachedLayers) {
      sendToUi({ type: 'selection-changed', payload: selectionInfo });
      sendToUi({
        type: 'template-layers',
        payload: {
          nodeId: frame.id,
          frameName: frame.name,
          ...cachedLayers,
          totalLayers: cachedLayers.textLayers.length + cachedLayers.imageLayers.length,
        },
      });
      return;
    }

    scanLayers(frame).then(layers => {
      cachedLayers = layers;
      currentTemplateId = frame.id;

      sendToUi({ type: 'selection-changed', payload: selectionInfo });
      sendToUi({
        type: 'template-layers',
        payload: {
          nodeId: frame.id,
          frameName: frame.name,
          ...layers,
          totalLayers: layers.textLayers.length + layers.imageLayers.length,
        },
      });
    }).catch(_e => {
      cachedLayers = null;
      sendToUi({ type: 'selection-changed', payload: selectionInfo });
      sendToUi({
        type: 'template-layers',
        payload: {
          nodeId: frame.id,
          frameName: frame.name,
          textLayers: [],
          imageLayers: [],
          totalLayers: 0,
        },
      });
    });
  } else {
    cachedLayers = null;
    currentTemplateId = null;
    sendToUi({ type: 'selection-changed', payload: selectionInfo });
  }
}

function handleUiReady(): void {
  const selection = figma.currentPage.selection;
  sendToUi({ type: 'selection-changed', payload: buildSelectionInfo() });

  if (selection.length === 1 && selection[0].type === 'FRAME') {
    processSelection();
  }
}

function handleRequestSelectionInfo(): void {
  sendToUi({ type: 'selection-changed', payload: buildSelectionInfo() });
  const selection = figma.currentPage.selection;
  if (selection.length === 1 && selection[0].type === 'FRAME') {
    processSelection();
  }
}

async function handleRequestTemplateLayers(nodeId: string): Promise<void> {
  const node = await figma.getNodeByIdAsync(nodeId);
  if (node && node.type === 'FRAME') {
    try {
      const layers = await scanLayers(node as FrameNode);
      sendToUi({
        type: 'template-layers',
        payload: {
          nodeId: node.id,
          frameName: node.name,
          ...layers,
          totalLayers: layers.textLayers.length + layers.imageLayers.length,
        },
      });
    } catch (_e) {
      sendToUi({
        type: 'template-layers',
        payload: {
          nodeId,
          frameName: '',
          textLayers: [],
          imageLayers: [],
          totalLayers: 0,
        },
      });
    }
  }
}

export function messageHandler(msg: unknown): void {
  const message = msg as UiToSandboxMessage | { type: 'selectionchange' };

  switch (message.type) {
    case 'ui-ready':
      handleUiReady();
      break;
    case 'request-selection-info':
      handleRequestSelectionInfo();
      break;
    case 'request-template-layers':
      handleRequestTemplateLayers(message.payload.nodeId);
      break;
    case 'start-generation':
      break;
    case 'cancel-generation':
      break;
    case 'selectionchange':
      handleSelectionChange();
      break;
    default:
      break;
  }
}
