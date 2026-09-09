import type { StorageStats } from '../types';

export async function checkStorageStats(): Promise<StorageStats> {
  const result: StorageStats = {
    supported: false,
    persisted: false,
    usageBytes: 0,
    quotaBytes: 0,
  };

  if (typeof navigator !== 'undefined' && navigator.storage) {
    result.supported = true;
    try {
      if (navigator.storage.persisted) {
        result.persisted = await navigator.storage.persisted();
      }
      if (navigator.storage.estimate) {
        const estimate = await navigator.storage.estimate();
        result.usageBytes = estimate.usage || 0;
        result.quotaBytes = estimate.quota || 0;
      }
    } catch {
      // Ignored if browser restricts estimate/persisted
    }
  }

  return result;
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
    try {
      return await navigator.storage.persist();
    } catch {
      return false;
    }
  }
  return false;
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}
