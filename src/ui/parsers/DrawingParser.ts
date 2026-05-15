import JSZip from 'jszip';
import type { ImageData } from '../../shared/types';

interface ImageAnchor {
  col: number;
  row: number;
  rId: string;
}

interface DrawingInfo {
  /** Set of column indices that contain images */
  imageColumns: Set<number>;
  /** Extracted image data per cell position */
  images: Array<{ col: number; row: number; image: ImageData }>;
}

export async function parseDrawings(
  buffer: Uint8Array,
  sheetIndex: number,
): Promise<DrawingInfo> {
  const zip = await JSZip.loadAsync(buffer);
  const imageColumns = new Set<number>();
  const images: Array<{ col: number; row: number; image: ImageData }> = [];

  const drawingAnchors = await getDrawingAnchors(zip, sheetIndex);
  for (const anchor of drawingAnchors) {
    imageColumns.add(anchor.col);
  }

  if (drawingAnchors.length > 0) {
    const imageData = await extractImageData(zip, sheetIndex, drawingAnchors);
    images.push(...imageData);
  }

  return { imageColumns, images };
}

async function getDrawingAnchors(
  zip: JSZip,
  sheetIndex: number,
): Promise<ImageAnchor[]> {
  const sheetRelsPath = `xl/worksheets/_rels/sheet${sheetIndex + 1}.xml.rels`;
  const relsFile = zip.file(sheetRelsPath);
  if (!relsFile) return [];

  const relsXml = await relsFile.async('string');
  const drawingPath = parseSheetDrawingRef(relsXml);
  if (!drawingPath) return [];

  const drawingFile = zip.file(`xl/drawings/${drawingPath}`);
  if (!drawingFile) return [];

  const drawingXml = await drawingFile.async('string');
  return parseAnchors(drawingXml);
}

function parseSheetDrawingRef(relsXml: string): string | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(relsXml, 'text/xml');
  const rels = doc.getElementsByTagName('Relationship');
  for (let i = 0; i < rels.length; i++) {
    const type = rels[i].getAttribute('Type') || '';
    if (type.includes('drawing')) {
      const target = rels[i].getAttribute('Target') || '';
      return target.replace('../drawings/', '');
    }
  }
  return null;
}

function parseAnchors(xml: string): ImageAnchor[] {
  const anchors: ImageAnchor[] = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');

  const anchorElements = doc.querySelectorAll('twoCellAnchor, oneCellAnchor');
  for (let i = 0; i < anchorElements.length; i++) {
    const anchor = anchorElements[i];
    const fromEl = anchor.querySelector('from');
    if (!fromEl) continue;

    const colEl = fromEl.querySelector('col');
    const rowEl = fromEl.querySelector('row');
    if (!colEl || !rowEl) continue;

    const col = parseInt(colEl.textContent || '0', 10);
    const row = parseInt(rowEl.textContent || '0', 10);

    const blipEl = anchor.querySelector('blip');
    const rId = blipEl ? (blipEl.getAttribute('r:embed') || '') : '';

    anchors.push({ col, row, rId });
  }
  return anchors;
}

async function extractImageData(
  zip: JSZip,
  sheetIndex: number,
  anchors: ImageAnchor[],
): Promise<Array<{ col: number; row: number; image: ImageData }>> {
  const results: Array<{ col: number; row: number; image: ImageData }> = [];

  const drawingRelsPath = await getDrawingRelsPath(zip, sheetIndex);
  if (!drawingRelsPath) return results;

  const relsFile = zip.file(drawingRelsPath);
  if (!relsFile) return results;

  const relsXml = await relsFile.async('string');
  const rIdMap = parseImageRefs(relsXml);

  for (const anchor of anchors) {
    if (!anchor.rId || !rIdMap.has(anchor.rId)) continue;
    const imagePath = `xl/media/${rIdMap.get(anchor.rId)}`;
    const imageFile = zip.file(imagePath);
    if (!imageFile) continue;

    const bytes = await imageFile.async('uint8array');
    const mime = detectMimeType(bytes);
    const dataUrl = `data:${mime};base64,${uint8ArrayToBase64(bytes)}`;

    results.push({
      col: anchor.col,
      row: anchor.row,
      image: {
        name: `image_${anchor.col}_${anchor.row}`,
        dataUrl,
        mimeType: mime,
        byteSize: bytes.byteLength,
      },
    });
  }

  return results;
}

async function getDrawingRelsPath(
  zip: JSZip,
  sheetIndex: number,
): Promise<string | null> {
  const sheetRelsPath = `xl/worksheets/_rels/sheet${sheetIndex + 1}.xml.rels`;
  const relsFile = zip.file(sheetRelsPath);
  if (!relsFile) return null;

  const relsXml = await relsFile.async('string');
  const parser = new DOMParser();
  const doc = parser.parseFromString(relsXml, 'text/xml');
  const rels = doc.getElementsByTagName('Relationship');
  for (let i = 0; i < rels.length; i++) {
    const type = rels[i].getAttribute('Type') || '';
    if (type.includes('drawing')) {
      const target = rels[i].getAttribute('Target') || '';
      const name = target.replace('../drawings/', '');
      return `xl/drawings/_rels/${name}.rels`;
    }
  }

  return null;
}

function parseImageRefs(relsXml: string): Map<string, string> {
  const map = new Map<string, string>();
  const parser = new DOMParser();
  const doc = parser.parseFromString(relsXml, 'text/xml');
  const rels = doc.getElementsByTagName('Relationship');
  for (let i = 0; i < rels.length; i++) {
    const id = rels[i].getAttribute('Id') || '';
    const target = rels[i].getAttribute('Target') || '';
    const type = rels[i].getAttribute('Type') || '';
    if (type.includes('image') && target) {
      const name = target.replace('../media/', '');
      map.set(id, name);
    }
  }
  return map;
}

function detectMimeType(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return 'image/gif';
  return 'image/png';
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
