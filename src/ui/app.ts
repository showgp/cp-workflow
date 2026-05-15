import type { SourceTable, TableField, PlaceholderLayer } from '../shared/types';
import { SUPPORTED_FILE_EXTENSIONS } from '../shared/constants';
import { messageHandler, setGenerateEnabledCallback, setTemplateLayersCallback } from './message-handler';
import { parseFile } from './parsers/FileParser';
import { renderFieldList } from './field-list';
import { createMappingPanel } from './mapping-view';
import type { MappingEntry, MappingPanelCallbacks } from './mapping-view';
import { showProgress, setProgressCancelCallback } from './progress-bar';
import { hideResult } from './result-view';
import type { GenerationConfig, LayoutSettings, LayoutDirection } from '../shared/types';
import { DEFAULT_LAYOUT } from '../shared/constants';

interface AppState {
  sourceTable: SourceTable | null;
  sourceReady: boolean;
  templateReady: boolean;
}

const appState: AppState = {
  sourceTable: null,
  sourceReady: false,
  templateReady: false,
};

let mappingEntries: MappingEntry[] = [];
let mappingPanel: ReturnType<typeof createMappingPanel> | null = null;
let currentFields: TableField[] = [];
let currentTextLayers: PlaceholderLayer[] = [];
let currentImageLayers: PlaceholderLayer[] = [];
let currentTemplateId: string | null = null;

function initialize(): void {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else {
    onReady();
  }
}

function onReady(): void {
  sendMessage({ type: 'ui-ready', payload: {} });

  setupDropZone();
  setupFileInput();
  setupGenerateButton();
  setupResizeHandle();

  sendMessage({ type: 'request-selection-info', payload: {} });
}

function sendMessage(msg: { type: string; payload: unknown }): void {
  parent.postMessage({ pluginMessage: msg }, '*');
}

function setupResizeHandle(): void {
  const handle = document.getElementById('resize-handle');
  if (!handle) return;

  let dragging = false;
  let lastSent = 0;

  function onMouseMove(e: MouseEvent): void {
    if (!dragging) return;
    const now = Date.now();
    if (now - lastSent < 50) return;
    lastSent = now;

    const newWidth = Math.max(280, Math.min(800, e.clientX));
    const newHeight = Math.max(360, Math.min(1200, e.clientY));
    sendMessage({
      type: 'resize-ui',
      payload: { width: Math.round(newWidth), height: Math.round(newHeight) },
    });
  }

  function onMouseUp(): void {
    dragging = false;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  }

  handle.addEventListener('mousedown', () => {
    dragging = true;
    lastSent = 0;
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
}

function setupFileInput(): void {
  const fileInput = document.getElementById('file-input') as HTMLInputElement | null;
  if (!fileInput) return;

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) {
      handleFile(file);
    }
    fileInput.value = '';
  });
}

function setupDropZone(): void {
  const dropZone = document.getElementById('file-upload-container');
  if (!dropZone) return;

  dropZone.classList.add('drop-zone');

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.add('drop-zone-active');
  });

  dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('drop-zone-active');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('drop-zone-active');

    const file = e.dataTransfer?.files?.[0];
    if (file) {
      handleFile(file);
    }
  });

  document.body.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  document.body.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
}

async function handleFile(file: File): Promise<void> {
  clearError();
  appState.sourceTable = null;

  const fileName = file.name.toLowerCase();
  const isXlsx = fileName.endsWith('.' + SUPPORTED_FILE_EXTENSIONS.XLSX);
  const isCsv = fileName.endsWith('.' + SUPPORTED_FILE_EXTENSIONS.CSV);

  if (!isXlsx && !isCsv) {
    showDataError('不支持的文件格式，请上传 .xlsx 或 .csv 文件');
    return;
  }

  const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
  const fileInfoEl = document.getElementById('file-info');
  if (fileInfoEl) {
    fileInfoEl.textContent = 'Parsing ' + file.name + ' (' + sizeMB + ' MB)...';
    fileInfoEl.className = 'file-info';
  }

  try {
    const sourceTable = await parseFile(file);
    appState.sourceTable = sourceTable;
    appState.sourceReady = true;

    displayFieldList(sourceTable.fields, sourceTable.totalRows);

    if (fieldsChanged(sourceTable.fields)) {
      mappingEntries = [];
      if (mappingPanel) mappingPanel.clearAll();
    }
    currentFields = sourceTable.fields;
    populateNamingSelector(sourceTable.fields);
    setupMappingPanel();

    updatePreviewInfo(sourceTable);
    updateGenerateButton();

    if (fileInfoEl) {
      fileInfoEl.textContent = 'Ready: ' + file.name + ' (' + sourceTable.totalRows + ' rows, ' + sourceTable.totalColumns + ' cols)';
      fileInfoEl.className = 'file-info file-info-success';
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : '文件解析失败';
    appState.sourceReady = false;
      showDataError(errorMsg);

    if (fileInfoEl) {
      fileInfoEl.textContent = '';
      fileInfoEl.className = 'file-info';
    }
  }
}

function displayFieldList(fields: TableField[], _totalRows: number): void {
  const container = document.getElementById('field-list-container');
  if (!container) return;
  renderFieldList(fields, container);
}

function updatePreviewInfo(sourceTable: SourceTable): void {
  const previewInfo = document.getElementById('preview-info');
  if (previewInfo) {
    previewInfo.textContent =
      '共 ' + sourceTable.totalRows + ' 行数据, ' +
      sourceTable.totalColumns + ' 列';
    previewInfo.className = 'preview-info preview-info-success';
  }
}

function updateGenerateButton(): void {
  const generateBtn = document.getElementById('generate-btn') as HTMLButtonElement | null;
  if (generateBtn) {
    generateBtn.disabled = !(appState.sourceReady && appState.templateReady);
  }
}

function showDataError(message: string): void {
  const dataSection = document.getElementById('data-section');
  if (!dataSection) return;

  let banner = dataSection.querySelector('.error-banner') as HTMLElement | null;
  if (!banner) {
    banner = document.createElement('div');
    banner.className = 'error-banner';
    dataSection.appendChild(banner);
  }
  banner.textContent = message;
  banner.style.display = 'block';

  const fieldContainer = document.getElementById('field-list-container');
  if (fieldContainer) {
    fieldContainer.innerHTML = '';
  }
}

function populateNamingSelector(fields: TableField[]): void {
  const select = document.getElementById('naming-select') as HTMLSelectElement;
  if (!select) return;
  while (select.options.length > 1) select.remove(1);
  for (const field of fields) {
    const opt = document.createElement('option');
    opt.value = field.name;
    opt.textContent = field.name;
    select.appendChild(opt);
  }
}

function setupMappingPanel(): void {
  const container = document.getElementById('mapping-container');
  if (!container) return;

  if (mappingPanel) {
    mappingPanel.setEntries(mappingEntries);
    return;
  }

  const callbacks: MappingPanelCallbacks = {
    onMappingsChanged: (entries: MappingEntry[]) => {
      mappingEntries = entries;
    },
    getSourceFields: () => currentFields,
    getTextLayers: () => currentTextLayers,
    getImageLayers: () => currentImageLayers,
  };

  mappingPanel = createMappingPanel(container, callbacks);
}

function fieldsChanged(newFields: TableField[]): boolean {
  if (currentFields.length !== newFields.length) return true;
  for (let i = 0; i < newFields.length; i++) {
    if (currentFields[i].index !== newFields[i].index ||
        currentFields[i].name !== newFields[i].name ||
        currentFields[i].type !== newFields[i].type) {
      return true;
    }
  }
  return false;
}

function showMappingWarning(message: string): void {
  const container = document.getElementById('mapping-container');
  if (!container) return;

  let banner = container.querySelector('.mapping-warning') as HTMLElement | null;
  if (!banner) {
    banner = document.createElement('div');
    banner.className = 'mapping-warning';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'mapping-warning-close';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => {
      if (banner) banner.style.display = 'none';
    });
    banner.appendChild(closeBtn);
    const text = document.createElement('span');
    banner.appendChild(text);
    container.insertBefore(banner, container.firstChild);
  }
  const text = banner.querySelector('span');
  if (text) text.textContent = message;
  banner.style.display = 'flex';
}

function clearError(): void {
  const dataSection = document.getElementById('data-section');
  if (!dataSection) return;

  const banner = dataSection.querySelector('.error-banner') as HTMLElement | null;
  if (banner) {
    banner.style.display = 'none';
    banner.textContent = '';
  }
}

setGenerateEnabledCallback((enabled: boolean) => {
  appState.templateReady = enabled;
  updateGenerateButton();
});

setTemplateLayersCallback((payload) => {
  const templateChanged = currentTemplateId !== null && currentTemplateId !== payload.nodeId;
  currentTemplateId = payload.nodeId;
  currentTextLayers = payload.textLayers;
  currentImageLayers = payload.imageLayers;

  if (templateChanged) {
    mappingEntries = [];
    if (mappingPanel) mappingPanel.clearAll();
    showMappingWarning('模板已变更，所有映射已清除');
  }

  setupMappingPanel();
  updateGenerateButton();
});

  window.addEventListener('message', (event) => {
    const msg = event.data.pluginMessage;
    if (msg) {
      messageHandler(msg);
    }
  });

  function setupGenerateButton(): void {
    const genBtn = document.getElementById('generate-btn') as HTMLButtonElement;
    if (!genBtn) return;

    genBtn.addEventListener('click', () => {
      handleGenerateClick();
    });

    setProgressCancelCallback(() => {
      sendMessage({ type: 'cancel-generation', payload: {} });
    });
  }

  function handleGenerateClick(): void {
    if (!appState.sourceTable) return;

    if (mappingEntries.length === 0) {
      showZeroMappingDialog();
      return;
    }

    startGeneration();
  }

  function showZeroMappingDialog(): void {
    const totalRows = appState.sourceTable?.totalRows || 0;

    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.innerHTML = `
      <div class="dialog-box">
        <div class="dialog-title">未建立任何映射</div>
        <div class="dialog-body">
          将生成模板副本但不替换任何内容。是否继续？<br>
          将生成 <strong>${totalRows}</strong> 页。
        </div>
        <div class="dialog-actions">
          <button class="dialog-btn dialog-btn-ghost" id="dialog-cancel">取消</button>
          <button class="dialog-btn dialog-btn-primary" id="dialog-confirm">继续生成</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('#dialog-cancel')?.addEventListener('click', () => {
      document.body.removeChild(overlay);
    });

    overlay.querySelector('#dialog-confirm')?.addEventListener('click', () => {
      document.body.removeChild(overlay);
      startGeneration();
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        // Don't close on overlay click — user must choose
      }
    });
  }

  function startGeneration(): void {
    if (!appState.sourceTable || !currentTemplateId) return;

    hideResult();
    showProgress();

    const directionEl = document.querySelector('input[name="layout-direction"]:checked') as HTMLInputElement;
    const direction = (directionEl ? directionEl.value : 'grid') as LayoutDirection;
    const layout: LayoutSettings = {
      ...DEFAULT_LAYOUT,
      direction: direction,
    };

    const namingSelect = document.getElementById('naming-select') as HTMLSelectElement;
    const nameColumn = namingSelect?.value || null;

    const config: GenerationConfig = {
      mapping: {
        entries: mappingEntries.map(e => ({
          id: e.id,
          sourceField: e.columnName,
          sourceFieldType: e.columnType,
          targetLayerId: e.targetLayerId,
          targetLayerName: e.targetLayerPath || e.targetLayerName,
          targetLayerType: e.columnType,
        })),
        templateNodeId: currentTemplateId,
        templateName: '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      sourceTable: appState.sourceTable,
      templatePreviewDataUrl: null,
      layout,
      nameColumn,
    };

    sendMessage({
      type: 'start-generation',
      payload: config,
    });
  }

  initialize();
