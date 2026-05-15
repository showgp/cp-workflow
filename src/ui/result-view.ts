import type { GenerationResult } from '../shared/types';
import { hideProgress } from './progress-bar';

export function showResult(result: GenerationResult): void {
  const container = document.getElementById('result-container');
  if (!container) return;

  const elapsed = ((result.endTime - result.startTime) / 1000).toFixed(1);

  let html = '<div class="result-view">';

  if (result.issueCount === 0 && result.warnings.length === 0) {
    html += `<div class="result-header result-success">✅ 生成完成</div>`;
  } else if (result.issueCount > 0) {
    html += `<div class="result-header result-warning">⚠️ 生成完成（存在问题行）</div>`;
  } else {
    html += `<div class="result-header result-warning">⚠️ 生成完成（存在警告）</div>`;
  }

  html += `<div class="result-summary">`;
  html += `成功生成 <strong>${result.successCount}</strong> 页，`;
  html += `耗时 ${elapsed} 秒`;
  if (result.issueCount > 0) {
    html += `，<span class="result-issue-count">${result.issueCount} 个问题行</span>`;
  }
  if (result.warnings.length > 0) {
    html += `，<span class="result-warning-count">${result.warnings.length} 个警告</span>`;
  }
  html += `</div>`;

  if (result.issues.length > 0) {
    html += `<div class="result-details"><div class="result-details-title">问题详情：</div>`;
    for (const issue of result.issues) {
      html += `<div class="result-detail-item">${escHtml(issue.message)}</div>`;
    }
    html += `</div>`;
  }

  if (result.warnings.length > 0) {
    html += `<div class="result-details"><div class="result-details-title">警告详情：</div>`;
    for (const warn of result.warnings) {
      html += `<div class="result-detail-item result-detail-warn">${escHtml(warn.message)}</div>`;
    }
    html += `</div>`;
  }

  html += '</div>';

  container.innerHTML = html;
  container.style.display = 'block';
  hideProgress();
}

export function showCancelledResult(
  successCount: number,
  processedRows: number,
  totalRows: number,
): void {
  const container = document.getElementById('result-container');
  if (!container) return;

  container.innerHTML = `
    <div class="result-view">
      <div class="result-header result-cancelled">⏹ 生成已取消</div>
      <div class="result-summary">
        已完成 <strong>${successCount}</strong> / ${totalRows} 页
      </div>
    </div>
  `;
  container.style.display = 'block';
  hideProgress();
}

export function showError(message: string): void {
  const container = document.getElementById('result-container');
  if (!container) return;

  container.innerHTML = `
    <div class="result-view">
      <div class="result-header result-error">❌ 生成失败</div>
      <div class="result-summary">${escHtml(message)}</div>
    </div>
  `;
  container.style.display = 'block';
  hideProgress();
}

export function hideResult(): void {
  const container = document.getElementById('result-container');
  if (container) {
    container.style.display = 'none';
    container.innerHTML = '';
  }
}

function escHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
