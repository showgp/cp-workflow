const ENCODING_LIST = ['utf-8', 'gbk', 'gb2312', 'big5', 'shift_jis'] as const;

const MAX_REPLACEMENT_RATIO = 0.05;

export interface EncodingResult {
  encoding: string;
  confidence: number;
  text: string;
}

export function detectEncoding(buffer: ArrayBuffer): EncodingResult {
  for (const encoding of ENCODING_LIST) {
    try {
      const decoder = new TextDecoder(encoding, { fatal: false });
      const text = decoder.decode(buffer);
      const replacementCount = countReplacementChars(text);
      const replacementRatio = text.length > 0 ? replacementCount / text.length : 0;

      if (replacementRatio <= MAX_REPLACEMENT_RATIO) {
        return { encoding, confidence: 1 - replacementRatio, text };
      }
    } catch {
      // skip unsupported encodings
    }
  }

  // fallback: return UTF-8 even if quality is poor
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const text = decoder.decode(buffer);
  const replacementCount = countReplacementChars(text);
  const confidence = text.length > 0 ? 1 - replacementCount / text.length : 0.5;
  return { encoding: 'utf-8', confidence, text };
}

export function decodeBuffer(buffer: ArrayBuffer, encoding: string): string {
  const decoder = new TextDecoder(encoding, { fatal: false });
  return decoder.decode(buffer);
}

function countReplacementChars(text: string): number {
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 0xfffd) {
      count++;
    }
  }
  return count;
}
