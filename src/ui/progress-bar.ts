import type { GenerationProgress } from '../shared/types';

let progressContainer: HTMLElement | null = null;
let onCancelCallback: (() => void) | null = null;

export function showProgress(): void {
  const container = document.getElementById('progress-container');
  if (!container) return;

  progressContainer = container;
  container.innerHTML = `
    <div class="progress-bar-wrapper">
      <div class="progress-bar-track">
        <div class="progress-bar-fill" style="width: 0%"></div>
      </div>
      <div class="progress-text">0 / 0</div>
      <button class="progress-cancel-btn" id="progress-cancel-btn">取消</button>
    </div>
  `;
  container.style.display = 'block';

  const cancelBtn = document.getElementById('progress-cancel-btn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      if (onCancelCallback) onCancelCallback();
      cancelBtn.textContent = '取消中...';
      (cancelBtn as HTMLButtonElement).disabled = true;
    });
  }
}

export function updateProgress(progress: GenerationProgress): void {
  if (!progressContainer) return;

  const fill = progressContainer.querySelector('.progress-bar-fill') as HTMLElement;
  const text = progressContainer.querySelector('.progress-text');
  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  if (fill) fill.style.width = pct + '%';
  if (text) text.textContent = `${progress.current} / ${progress.total}`;
}

export function hideProgress(): void {
  const container = document.getElementById('progress-container');
  if (container) container.style.display = 'none';
  progressContainer = null;
}

export function setProgressCancelCallback(callback: () => void): void {
  onCancelCallback = callback;
}
