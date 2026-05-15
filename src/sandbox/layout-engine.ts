import type { LayoutSettings } from '../shared/types';
import { DEFAULT_LAYOUT } from '../shared/constants';

export function layoutFrames(frames: FrameNode[], settings: LayoutSettings = DEFAULT_LAYOUT): void {
  if (frames.length === 0) return;

  const firstFrame = frames[0];
  const baseX = firstFrame.x;
  const baseY = firstFrame.y;
  const frameWidth = firstFrame.width;
  const frameHeight = firstFrame.height;

  for (let i = 0; i < frames.length; i++) {
    const pos = calculateGridPosition(i, frameWidth, frameHeight, settings);
    frames[i].x = baseX + pos.x;
    frames[i].y = baseY + pos.y;
  }
}

export function calculateGridPosition(
  index: number,
  frameWidth: number,
  frameHeight: number,
  settings: LayoutSettings,
): { x: number; y: number } {
  const cols = settings.columns || 4;
  const hGap = settings.horizontalGap || 80;
  const vGap = settings.verticalGap || 100;
  const col = index % cols;
  const row = Math.floor(index / cols);

  return {
    x: col * (frameWidth + hGap),
    y: row * (frameHeight + vGap),
  };
}
