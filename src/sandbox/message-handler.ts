import type { UiToSandboxMessage, SandboxToUiMessage } from '../shared/messages';
import type { SelectionInfo, SelectedNodeSummary, PlaceholderLayer, GenerationConfig, Issue, Warning } from '../shared/types';
import { scanLayers } from './layer-scanner';
import { cloneFrame } from './frame-cloner';
import { fillContent, loadFonts } from './content-filler';
import { layoutFrames } from './layout-engine';
import { DEFAULT_LAYOUT } from '../shared/constants';

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let currentTemplateId: string | null = null;
let cachedLayers: { textLayers: PlaceholderLayer[]; imageLayers: PlaceholderLayer[] } | null = null;
let cancelRequested = false;
let generatedFrames: FrameNode[] = [];

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

async function handleStartGeneration(config: GenerationConfig): Promise<void> {
  cancelRequested = false;
  generatedFrames = [];

  const mappings = config.mapping.entries;
  const rows = config.sourceTable.rows;
  const layout = config.layout || DEFAULT_LAYOUT;

  let templateFrame: FrameNode | null = null;
  const selection = figma.currentPage.selection;
  if (selection.length === 1 && selection[0].type === 'FRAME') {
    templateFrame = selection[0] as FrameNode;
  } else {
    const node = await figma.getNodeByIdAsync(config.mapping.templateNodeId);
    if (node && node.type === 'FRAME') {
      templateFrame = node as FrameNode;
    }
  }

  if (!templateFrame) {
    sendToUi({
      type: 'generation-error',
      payload: {
        message: '模板 Frame 未找到',
        phase: 'cloning',
        rowIndex: -1,
        detail: 'Template frame not found',
      },
    });
    return;
  }

  await loadFonts(templateFrame);

  const allIssues: Issue[] = [];
  const allWarnings: Warning[] = [];
  const startTime = Date.now();

  for (let i = 0; i < rows.length; i++) {
    if (cancelRequested) {
      const resultPayload = {
        successCount: generatedFrames.length,
        processedRows: i,
        totalRows: rows.length,
      };
      sendToUi({
        type: 'generation-cancelled',
        payload: resultPayload,
      });
      return;
    }

    try {
      const clone = cloneFrame(templateFrame);
      generatedFrames.push(clone);

      if (mappings.length > 0) {
        const { issues, warnings } = fillContent(clone, mappings, rows[i]);
        allIssues.push(...issues);
        allWarnings.push(...warnings);
      }

      if (config.nameColumn) {
        const cellValue = rows[i].cells[config.nameColumn];
        if (cellValue != null && String(cellValue).trim() !== '') {
          clone.name = String(cellValue).trim();
        }
      }

      sendToUi({
        type: 'generation-progress',
        payload: {
          current: i + 1,
          total: rows.length,
          status: 'running',
          currentRowIndex: i,
        },
      });
    } catch (err) {
      sendToUi({
        type: 'generation-error',
        payload: {
          message: err instanceof Error ? err.message : '生成失败',
          phase: 'filling',
          rowIndex: i,
          detail: String(err),
        },
      });
      return;
    }
  }

  layoutFrames(generatedFrames, layout);

  const endTime = Date.now();
  const result = {
    successCount: generatedFrames.length,
    issueCount: allIssues.length,
    totalRows: rows.length,
    issues: allIssues,
    warnings: allWarnings,
    startTime,
    endTime,
  };

  sendToUi({
    type: 'generation-complete',
    payload: result,
  });
}

function handleCancelGeneration(): void {
  cancelRequested = true;
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
      handleStartGeneration(message.payload);
      break;
    case 'cancel-generation':
      handleCancelGeneration();
      break;
    case 'resize-ui':
      figma.ui.resize(message.payload.width, message.payload.height);
      break;
    case 'selectionchange':
      handleSelectionChange();
      break;
    default:
      break;
  }
}
