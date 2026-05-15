import type { LayoutSettings } from '../shared/types';

export function layoutFrames(_frames: FrameNode[], _settings: LayoutSettings): void {
  throw new Error('Not implemented');
}

export function calculateGridPosition(
  _index: number,
  _frameWidth: number,
  _frameHeight: number,
  _settings: LayoutSettings
): { x: number; y: number } {
  throw new Error('Not implemented');
}
