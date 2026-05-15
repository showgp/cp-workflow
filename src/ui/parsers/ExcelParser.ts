import * as XLSX from 'xlsx';
import type { SourceTable, TableField, TableRow, ImageData } from '../../shared/types';
import { MESSAGES } from '../../shared/constants';
import { parseDrawings } from './DrawingParser';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function parseExcelFile(file: File): Promise<SourceTable> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('文件大小超过 10MB 限制');
  }

  try {
    const buffer = await readFileAsArrayBuffer(file);
    const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const ws = workbook.Sheets[sheetName];

    const rawRows: unknown[][] = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: null,
      blankrows: false,
    });

    const sheetIndex = workbook.SheetNames.indexOf(sheetName);
    const drawingInfo = await parseDrawings(new Uint8Array(buffer), sheetIndex);

    const sheetImageColumns = detectImageColumns(ws);
    const imageColumns = sheetImageColumns.size > 0 ? sheetImageColumns : drawingInfo.imageColumns;

    const sheetExtracted = extractImages(ws);
    const extractedImages = sheetExtracted.length > 0 ? sheetExtracted : drawingInfo.images;

    const rawHeaders = rawRows.length > 0 ? rawRows[0] : [];
    const dataRows = rawRows.slice(1);

    const headers = deduplicateHeaders(rawHeaders);

    const fields: TableField[] = headers.map((name, colIdx) => {
      const isImageCol = imageColumns.has(colIdx);
      const type = isImageCol ? 'image' : 'text';
      let sample: string;
      if (isImageCol) {
        const count = extractedImages.filter((img) => img.col === colIdx).length;
        sample = `${count} 张图片`;
      } else {
        sample = getTextSample(dataRows, colIdx);
      }
      return { name, index: colIdx, type, sample: sample || '' };
    });

    const rows: TableRow[] = [];
    for (let i = 0; i < dataRows.length; i++) {
      if (isBlankRow(dataRows[i])) continue;

      const cells: Record<string, string | ImageData | null> = {};
      for (let j = 0; j < headers.length; j++) {
        const colName = headers[j];
        if (imageColumns.has(j)) {
          const cellImage = extractedImages.find((img) => img.row === i + 1 && img.col === j);
          cells[colName] = cellImage ? cellImage.image : null;
        } else {
          const val = dataRows[i][j];
          cells[colName] = val != null ? String(val) : null;
        }
      }
      rows.push({ index: i, cells });
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'xlsx';

    return {
      fields,
      rows,
      fileName: file.name,
      fileExtension: ext,
      totalRows: rows.length,
      totalColumns: fields.length,
    };
  } catch (err) {
    if (err instanceof Error && err.message.includes('文件大小')) {
      throw err;
    }
    throw new Error(
      MESSAGES.FILE_PARSE_ERROR.replace(
        '{reason}',
        err instanceof Error ? err.message : '未知错误',
      ),
    );
  }
}

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.readAsArrayBuffer(file);
  });
}

function detectImageColumns(ws: XLSX.WorkSheet): Set<number> {
  const cols = new Set<number>();
  const images = (ws as Record<string, unknown>)['!images'] as Record<string, unknown>[] | undefined;
  if (!images || !Array.isArray(images)) return cols;

  for (const img of images) {
    if (!img) continue;
    const l = img['l'];
    if (l != null) {
      if (typeof l === 'number') {
        cols.add(l);
      } else if (typeof l === 'object' && l !== null) {
        const lObj = l as Record<string, unknown>;
        if (typeof lObj['c'] === 'number') {
          cols.add(lObj['c'] as number);
        }
      }
    }
  }
  return cols;
}

interface ExtractedImage {
  row: number;
  col: number;
  image: ImageData;
}

function extractImages(ws: XLSX.WorkSheet): ExtractedImage[] {
  const results: ExtractedImage[] = [];
  const images = (ws as Record<string, unknown>)['!images'] as Record<string, unknown>[] | undefined;
  if (!images || !Array.isArray(images)) return results;

  for (const img of images) {
    if (!img) continue;

    const col = getAnchorCol(img);
    const row = getAnchorRow(img);

    let rawData: Uint8Array | null = null;

    if (img['data'] instanceof Uint8Array) {
      rawData = img['data'] as Uint8Array;
    } else if (img['raw'] instanceof Uint8Array) {
      rawData = img['raw'] as Uint8Array;
    } else if (typeof img['base64'] === 'string') {
      rawData = base64ToUint8Array(img['base64'] as string);
    }

    if (rawData) {
      const mime = detectMimeType(rawData);
      const dataUrl = `data:${mime};base64,${uint8ArrayToBase64(rawData)}`;
      results.push({
        row,
        col,
        image: {
          name: (img['name'] as string) || 'image',
          dataUrl,
          mimeType: mime,
          byteSize: rawData.byteLength,
        },
      });
    }
  }

  return results;
}

function getAnchorCol(img: Record<string, unknown>): number {
  const l = img['l'];
  if (l == null) return 0;
  if (typeof l === 'number') return l;
  if (typeof l === 'object' && l !== null) {
    const lObj = l as Record<string, unknown>;
    if (typeof lObj['c'] === 'number') return lObj['c'] as number;
  }
  return 0;
}

function getAnchorRow(img: Record<string, unknown>): number {
  const t = img['t'];
  if (t == null) return 0;
  if (typeof t === 'number') return t;
  if (typeof t === 'object' && t !== null) {
    const tObj = t as Record<string, unknown>;
    if (typeof tObj['r'] === 'number') return tObj['r'] as number;
  }
  return 0;
}

function deduplicateHeaders(rawHeaders: unknown[]): string[] {
  const result: string[] = [];
  const seen: Record<string, number> = {};

  for (let i = 0; i < rawHeaders.length; i++) {
    let name = rawHeaders[i] != null ? String(rawHeaders[i]).trim() : '';
    if (!name) {
      name = `列 ${columnIndexToLetter(i)}`;
    }

    const count = seen[name] || 0;
    if (count > 0) {
      result.push(`${name}_${count}`);
    } else {
      result.push(name);
    }
    seen[name] = count + 1;
  }

  return result;
}

function columnIndexToLetter(index: number): string {
  let result = '';
  let n = index;
  do {
    result = String.fromCharCode((n % 26) + 65) + result;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return result;
}

function getTextSample(dataRows: unknown[][], colIdx: number): string {
  for (let i = 0; i < dataRows.length; i++) {
    const val = dataRows[i][colIdx];
    if (val != null && String(val).trim() !== '') {
      const text = String(val).trim();
      return text.length > 50 ? text.slice(0, 47) + '...' : text;
    }
  }
  return '';
}

function isBlankRow(row: unknown[]): boolean {
  return row.every(
    (cell) => cell == null || (typeof cell === 'string' && cell.trim() === ''),
  );
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

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
