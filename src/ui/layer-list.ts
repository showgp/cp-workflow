import type { PlaceholderLayer } from '../shared/types';

let layerContainer: HTMLElement | null = null;

export function renderLayerList(
  textLayers: PlaceholderLayer[],
  imageLayers: PlaceholderLayer[],
  container: HTMLElement,
): void {
  layerContainer = container;
  container.innerHTML = '';

  const totalLayers = textLayers.length + imageLayers.length;

  if (totalLayers === 0) {
    container.innerHTML = '<div class="empty-state">模板中未检测到可填充的文本层或图片层</div>';
    return;
  }

  if (textLayers.length > 0) {
    const textSection = document.createElement('div');
    textSection.className = 'layer-group';
    textSection.innerHTML = `<div class="layer-group-header">文本层 (${textLayers.length})</div>`;
    textLayers.forEach(layer => {
      textSection.appendChild(createLayerItem(layer, 'T'));
    });
    container.appendChild(textSection);
  }

  if (imageLayers.length > 0) {
    const imageSection = document.createElement('div');
    imageSection.className = 'layer-group';
    imageSection.innerHTML = `<div class="layer-group-header">图片层 (${imageLayers.length})</div>`;
    imageLayers.forEach(layer => {
      imageSection.appendChild(createLayerItem(layer, 'IMG'));
    });
    container.appendChild(imageSection);
  }
}

function createLayerItem(layer: PlaceholderLayer, icon: string): HTMLElement {
  const item = document.createElement('div');
  item.className = 'layer-item';
  item.dataset.layerId = layer.id;

  const preview = layer.currentContent.length > 50
    ? layer.currentContent.substring(0, 50) + '...'
    : layer.currentContent;

  item.innerHTML = `
    <span class="layer-icon">${icon}</span>
    <div class="layer-info">
      <div class="layer-name">${esc(layer.name)}</div>
      <div class="layer-path">${esc(layer.path)}</div>
      <div class="layer-preview">${esc(preview)}</div>
    </div>
  `;

  return item;
}

function esc(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export function clearLayerList(): void {
  if (layerContainer) {
    layerContainer.innerHTML = '';
  }
}

export function updateTemplateStatus(status: string, detail?: string): void {
  const el = document.getElementById('template-status');
  if (!el) return;

  switch (status) {
    case 'no-selection':
      el.innerHTML = '<div class="status status-gray">请先在画布中选中一个模板 Frame</div>';
      break;
    case 'multiple':
      el.innerHTML = '<div class="status status-warning">请只选择一个 Frame 作为模板，当前选中了多个对象</div>';
      break;
    case 'not-frame':
      el.innerHTML = `<div class="status status-warning">请选择一个 Frame 作为模板，当前选中的是 ${detail || '非Frame对象'}</div>`;
      break;
    case 'valid':
      el.innerHTML = `<div class="status status-success">已选择模板：${detail || ''}</div>`;
      break;
    default:
      break;
  }
}
