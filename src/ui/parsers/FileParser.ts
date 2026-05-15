import type { SourceTable } from '../../shared/types';
import { SUPPORTED_FILE_EXTENSIONS } from '../../shared/constants';
import { parseExcelFile } from './ExcelParser';
import { parseCsvFile } from './CsvParser';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function parseFile(file: File): Promise<SourceTable> {
  const ext = getFileExtension(file.name);

  if (!validateFileType(file)) {
    throw new Error(
      'Unsupported file type. Please upload .xlsx or .csv files.',
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error('File size exceeds 10MB limit.');
  }

  if (ext === SUPPORTED_FILE_EXTENSIONS.XLSX) {
    return parseExcelFile(file);
  }

  if (ext === SUPPORTED_FILE_EXTENSIONS.CSV) {
    return parseCsvFile(file);
  }

  throw new Error(
    'Unsupported file type. Please upload .xlsx or .csv files.',
  );
}

export function getFileExtension(fileName: string): string {
  const parts = fileName.split('.');
  if (parts.length < 2) return '';
  return parts[parts.length - 1].toLowerCase();
}

export function validateFileType(file: File): boolean {
  const ext = getFileExtension(file.name);
  return ext === SUPPORTED_FILE_EXTENSIONS.XLSX || ext === SUPPORTED_FILE_EXTENSIONS.CSV;
}
