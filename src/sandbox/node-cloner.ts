export function cloneNode(template: FrameNode | InstanceNode | GroupNode): SceneNode {
  const clone = template.clone();
  figma.currentPage.appendChild(clone);
  clone.x = template.absoluteTransform[0][2];
  clone.y = template.absoluteTransform[1][2];
  return clone;
}
