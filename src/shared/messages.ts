import type {
  SelectionInfo,
  PlaceholderLayer,
  GenerationConfig,
  GenerationProgress,
  GenerationResult,
} from './types';

// Message type constants
export const UI_TO_SANDBOX = {
  UI_READY: 'ui-ready',
  REQUEST_SELECTION_INFO: 'request-selection-info',
  REQUEST_TEMPLATE_LAYERS: 'request-template-layers',
  START_GENERATION: 'start-generation',
  CANCEL_GENERATION: 'cancel-generation',
} as const;

export const SANDBOX_TO_UI = {
  SELECTION_CHANGED: 'selection-changed',
  TEMPLATE_LAYERS: 'template-layers',
  GENERATION_PROGRESS: 'generation-progress',
  GENERATION_COMPLETE: 'generation-complete',
  GENERATION_CANCELLED: 'generation-cancelled',
  GENERATION_ERROR: 'generation-error',
} as const;

// UI → Sandbox messages
export interface UiReadyMessage {
  type: 'ui-ready';
  payload: Record<string, never>;
}

export interface RequestSelectionInfoMessage {
  type: 'request-selection-info';
  payload: Record<string, never>;
}

export interface RequestTemplateLayersMessage {
  type: 'request-template-layers';
  payload: { nodeId: string };
}

export interface StartGenerationMessage {
  type: 'start-generation';
  payload: GenerationConfig;
}

export interface CancelGenerationMessage {
  type: 'cancel-generation';
  payload: Record<string, never>;
}

// Sandbox → UI messages
export interface SelectionChangedMessage {
  type: 'selection-changed';
  payload: SelectionInfo;
}

export interface TemplateLayersMessage {
  type: 'template-layers';
  payload: {
    nodeId: string;
    frameName: string;
    textLayers: PlaceholderLayer[];
    imageLayers: PlaceholderLayer[];
    totalLayers: number;
  };
}

export interface GenerationProgressMessage {
  type: 'generation-progress';
  payload: GenerationProgress;
}

export interface GenerationCompleteMessage {
  type: 'generation-complete';
  payload: GenerationResult;
}

export interface GenerationCancelledMessage {
  type: 'generation-cancelled';
  payload: {
    successCount: number;
    processedRows: number;
    totalRows: number;
  };
}

export interface GenerationErrorMessage {
  type: 'generation-error';
  payload: {
    message: string;
    phase: 'cloning' | 'filling' | 'layout';
    rowIndex: number;
    detail: string;
  };
}

// Discriminated unions
export type UiToSandboxMessage =
  | UiReadyMessage
  | RequestSelectionInfoMessage
  | RequestTemplateLayersMessage
  | StartGenerationMessage
  | CancelGenerationMessage;

export type SandboxToUiMessage =
  | SelectionChangedMessage
  | TemplateLayersMessage
  | GenerationProgressMessage
  | GenerationCompleteMessage
  | GenerationCancelledMessage
  | GenerationErrorMessage;

export type PluginMessage = UiToSandboxMessage | SandboxToUiMessage;
