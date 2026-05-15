const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function base64ToUint8Array(base64: string): Uint8Array {
  const pure = base64.includes(',') ? base64.split(',')[1] : base64;
  const cleaned = pure.replace(/=+$/, '');
  const output = new Uint8Array(Math.floor((cleaned.length * 3) / 4));

  const lookup = new Map<string, number>();
  for (let i = 0; i < BASE64_CHARS.length; i++) {
    lookup.set(BASE64_CHARS[i], i);
  }

  let outIdx = 0;
  for (let i = 0; i < cleaned.length; i += 4) {
    const c1 = lookup.get(cleaned[i]) != null ? lookup.get(cleaned[i])! : -1;
    const c2 = lookup.get(cleaned[i + 1]) != null ? lookup.get(cleaned[i + 1])! : -1;
    const c3 = i + 2 < cleaned.length ? (lookup.get(cleaned[i + 2]) != null ? lookup.get(cleaned[i + 2])! : -1) : -1;
    const c4 = i + 3 < cleaned.length ? (lookup.get(cleaned[i + 3]) != null ? lookup.get(cleaned[i + 3])! : -1) : -1;

    if (c1 < 0 || c2 < 0) throw new Error('Invalid base64 character');

    output[outIdx++] = (c1 << 2) | (c2 >> 4);
    if (c3 >= 0) output[outIdx++] = ((c2 & 0x0f) << 4) | (c3 >> 2);
    if (c4 >= 0) output[outIdx++] = ((c3 & 0x03) << 6) | c4;
  }

  return output;
}
