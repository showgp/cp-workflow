import type { SourceTable, TableField } from '../shared/types';
import { SUPPORTED_FILE_EXTENSIONS } from '../shared/constants';
import { messageHandler, setGenerateEnabledCallback } from './message-handler';
import { parseFile } from './parsers/FileParser';
import { renderFieldList } from './field-list';

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

function initialize(): void {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else {
    onReady();
  }
}

function onReady(): void {
  sendMessage({ type: 'ui-ready', payload: {} });

  setupUploadButton();
  setupDropZone();
  setupFileInput();

  sendMessage({ type: 'request-selection-info', payload: {} });
}

function sendMessage(msg: { type: string; payload: unknown }): void {
  parent.postMessage({ pluginMessage: msg }, '*');
}

function setupUploadButton(): void {
  const uploadBtn = document.getElementById('upload-btn');
  const fileInput = document.getElementById('file-input') as HTMLInputElement | null;

  if (uploadBtn && fileInput) {
    uploadBtn.addEventListener('click', () => {
      fileInput.click();
    });
  }
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
    showError('不支持的文件格式，请上传 .xlsx 或 .csv 文件');
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
    updatePreviewInfo(sourceTable);
    updateGenerateButton();

    if (fileInfoEl) {
      fileInfoEl.textContent = 'Ready: ' + file.name + ' (' + sourceTable.totalRows + ' rows, ' + sourceTable.totalColumns + ' cols)';
      fileInfoEl.className = 'file-info file-info-success';
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : '文件解析失败';
    appState.sourceReady = false;
    showError(errorMsg);

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

function showError(message: string): void {
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

window.addEventListener('message', (event) => {
  const msg = event.data.pluginMessage;
  if (msg) {
    messageHandler(msg);
  }
});

initialize();
