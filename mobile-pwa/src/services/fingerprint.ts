/**
 * Generates a stable content fingerprint (SHA-256 hex string) for a given File or ArrayBuffer.
 * This ensures that duplicate books are recognized regardless of filename changes.
 */
export async function computeFileFingerprint(fileOrBuffer: File | Blob | ArrayBuffer): Promise<string> {
  let arrayBuffer: ArrayBuffer;

  if (fileOrBuffer instanceof ArrayBuffer) {
    arrayBuffer = fileOrBuffer;
  } else {
    arrayBuffer = await fileOrBuffer.arrayBuffer();
  }

  // Feature detect crypto.subtle
  if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
    try {
      const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      // Truncate to first 16 bytes (32 hex characters) for clean IDs
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
    } catch {
      // fallback below
    }
  }

  // Fallback hash implementation (FNV-1a / Murmur-inspired fast 64-bit combination)
  const bytes = new Uint8Array(arrayBuffer);
  let h1 = 0xdeadbeef ^ bytes.length;
  let h2 = 0x41c6ce57 ^ bytes.length;
  const step = Math.max(1, Math.floor(bytes.length / 4096)); // Sample points if large

  for (let i = 0; i < bytes.length; i += step) {
    const byte = bytes[i];
    h1 = Math.imul(h1 ^ byte, 2654435761);
    h2 = Math.imul(h2 ^ byte, 1597334677);
  }

  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);

  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0') + bytes.length.toString(16);
}
