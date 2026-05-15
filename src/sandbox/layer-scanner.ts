import type { PlaceholderLayer } from '../shared/types';

const IMAGE_NODE_TYPES = new Set([
  'RECTANGLE', 'ELLIPSE', 'POLYGON', 'STAR', 'LINE', 'VECTOR',
]);

const PENETRATE_TYPES = new Set(['GROUP', 'BOOLEAN_OPERATION']);

const STOP_TYPES = new Set(['FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE', 'SECTION']);

export async function scanLayers(templateFrame: FrameNode): Promise<{
  textLayers: PlaceholderLayer[];
  imageLayers: PlaceholderLayer[];
}> {
  const result = {
    textLayers: [] as PlaceholderLayer[],
    imageLayers: [] as PlaceholderLayer[],
  };

  await collectLayers(templateFrame, templateFrame.id, result);
  return result;
}

async function collectLayers(
  node: SceneNode,
  frameId: string,
  result: { textLayers: PlaceholderLayer[]; imageLayers: PlaceholderLayer[] },
): Promise<void> {
  if ('visible' in node && node.visible === false) return;
  if ('locked' in node && node.locked === true) return;

  if (node.id !== frameId && STOP_TYPES.has(node.type)) return;

  if (node.type === 'TEXT') {
    const textNode = node as TextNode;
    const path = await buildPath(node, frameId);
    let content = '';
    try {
      content = textNode.characters;
    } catch (_e) {
      content = '(无法读取)';
    }
    result.textLayers.push({
      id: textNode.id,
      name: textNode.name,
      nodeType: 'TEXT',
      path,
      currentContent: content.slice(0, 100),
      layerType: 'text',
    });
    return;
  }

  if (IMAGE_NODE_TYPES.has(node.type)) {
    const path = await buildPath(node, frameId);
    const hasImageFill = checkHasImageFill(node);
    result.imageLayers.push({
      id: node.id,
      name: node.name,
      nodeType: node.type,
      path,
      currentContent: hasImageFill ? '有图片填充' : '无图片填充',
      layerType: 'image',
    });

    if (PENETRATE_TYPES.has(node.type)) {
      if ('children' in node) {
        for (const child of (node as ChildrenMixin).children) {
          await collectLayers(child, frameId, result);
        }
      }
    }
    return;
  }

  if (PENETRATE_TYPES.has(node.type)) {
    if ('children' in node) {
      for (const child of (node as ChildrenMixin).children) {
        await collectLayers(child, frameId, result);
      }
    }
    return;
  }

  if ('children' in node) {
    for (const child of (node as ChildrenMixin).children) {
      await collectLayers(child, frameId, result);
    }
  }
}

async function buildPath(node: SceneNode, frameId: string): Promise<string> {
  const parts: string[] = [];
  let current: BaseNode | null = node;

  while (current && current.id !== frameId) {
    if ('name' in current && typeof current.name === 'string') {
      parts.unshift(current.name);
    }
    if ('parent' in current && current.parent) {
      current = current.parent as BaseNode | null;
    } else {
      break;
    }
  }

  const frame = await figma.getNodeByIdAsync(frameId);
  if (frame && 'name' in frame && typeof frame.name === 'string') {
    parts.unshift(frame.name);
  }

  return parts.join(' > ');
}

function checkHasImageFill(node: SceneNode): boolean {
  if (!('fills' in node)) return false;
  const fills = (node as GeometryMixin).fills;
  if (!fills || typeof fills === 'symbol') return false;
  for (const fill of fills) {
    if (fill.type === 'IMAGE' && fill.visible !== false) {
      return true;
    }
  }
  return false;
}
