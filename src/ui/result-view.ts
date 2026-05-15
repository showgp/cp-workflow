import type { GenerationResult } from '../shared/types';

export function showResult(_result: GenerationResult): void {
  throw new Error('Not implemented');
}

export function hideResult(): void {
  throw new Error('Not implemented');
}

export function showCancelledResult(_successCount: number, _processedRows: number, _totalRows: number): void {
  throw new Error('Not implemented');
}

export function showError(_message: string): void {
  throw new Error('Not implemented');
}
