import * as Papa from 'papaparse';
import { detectEncoding, decodeBuffer } from './encoding';
import type { SourceTable, TableField, TableRow } from '../../shared/types';
import { MESSAGES } from '../../shared/constants';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const CSV_DELIMITERS: readonly string[] = [',', ';', '\t'];
const DELIMITER_SCAN_LINES = 5;

export async function parseCsvFile(file: File): Promise<SourceTable> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('文件大小超过 10MB 限制');
  }

  try {
    const buffer = await readFileAsArrayBuffer(file);
    const { encoding, text } = detectEncoding(buffer);

    const decodedText = encoding !== 'utf-8'
      ? decodeBuffer(buffer, encoding)
      : text;

    const delimiter = detectDelimiter(decodedText);

    const parseResult = Papa.parse(decodedText, {
      header: false,
      skipEmptyLines: 'greedy',
      dynamicTyping: false,
      delimiter,
    });

    const rawRows: unknown[][] = parseResult.data as unknown[][];

    const rawHeaders = rawRows.length > 0 ? rawRows[0] : [];
    const dataRows = rawRows.slice(1);

    const headers = deduplicateHeaders(rawHeaders);

    const fields: TableField[] = headers.map((name, colIdx) => ({
      name,
      index: colIdx,
      type: 'text' as const,
      sample: getTextSample(dataRows, colIdx) || '',
    }));

    const rows: TableRow[] = [];
    for (let i = 0; i < dataRows.length; i++) {
      if (isBlankRow(dataRows[i])) continue;

      const cells: Record<string, string | null> = {};
      for (let j = 0; j < headers.length; j++) {
        const colName = headers[j];
        const val = dataRows[i][j];
        cells[colName] = val != null ? String(val) : null;
      }
      rows.push({ index: i, cells });
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'csv';

    return {
      fields,
      rows,
      fileName: file.name,
      fileExtension: ext,
      totalRows: rows.length,
      totalColumns: fields.length,
    };
  } catch (err) {
    if (err instanceof Error && err.message.includes('10MB')) {
      throw err;
    }
    throw new Error(
      MESSAGES.FILE_PARSE_ERROR.replace(
        '{reason}',
        err instanceof Error ? err.message : '解析错误',
      ),
    );
  }
}

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error('File read error'));
    reader.readAsArrayBuffer(file);
  });
}

function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/)
    .filter((l) => l.trim() !== '')
    .slice(0, DELIMITER_SCAN_LINES);
  if (lines.length === 0) return ',';

  let bestDelimiter = ',';
  let bestScore = 0;

  for (const delim of CSV_DELIMITERS) {
    const fieldCounts = lines.map((line) => line.split(delim).length);
    const minCount = Math.min(...fieldCounts);
    const maxCount = Math.max(...fieldCounts);

    if (minCount > 1 && minCount === maxCount) {
      if (minCount > bestScore) {
        bestScore = minCount;
        bestDelimiter = delim;
      }
    }
  }

  if (bestScore <= 1) {
    for (const delim of CSV_DELIMITERS) {
      const maxFields = Math.max(...lines.map((line) => line.split(delim).length));
      if (maxFields > bestScore) {
        bestScore = maxFields;
        bestDelimiter = delim;
      }
    }
  }

  return bestDelimiter;
}

function deduplicateHeaders(rawHeaders: unknown[]): string[] {
  const result: string[] = [];
  const seen: Record<string, number> = {};

  for (let i = 0; i < rawHeaders.length; i++) {
    let name = rawHeaders[i] != null ? String(rawHeaders[i]).trim() : '';
    if (!name) {
      name = '列 ' + columnIndexToLetter(i);
    }

    const count = seen[name] || 0;
    if (count > 0) {
      result.push(name + '_' + count);
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
