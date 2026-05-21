export function cloneNode(template: FrameNode | InstanceNode | GroupNode): SceneNode {
  const clone = template.clone();
  figma.currentPage.appendChild(clone);
  return clone;
}
