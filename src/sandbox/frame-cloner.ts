export function cloneFrame(templateFrame: FrameNode): FrameNode {
  const clone = templateFrame.clone();
  figma.currentPage.appendChild(clone);
  return clone;
}
