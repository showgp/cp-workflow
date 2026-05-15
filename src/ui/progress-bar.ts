import type { GenerationProgress } from '../shared/types';

export function showProgress(): void {
  throw new Error('Not implemented');
}

export function updateProgress(_progress: GenerationProgress): void {
  throw new Error('Not implemented');
}

export function hideProgress(): void {
  throw new Error('Not implemented');
}

export function setProgressCancelCallback(_callback: () => void): void {
  throw new Error('Not implemented');
}
