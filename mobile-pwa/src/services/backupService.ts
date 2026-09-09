import type { BackupData, ReadingProgress, Bookmark } from '../types';
import { getAllBooks, getAllProgress, getAllBookmarks, saveProgress, saveBookmark, saveUnmatchedBackup, getBook } from './db';

const BACKUP_VERSION = 1;

/**
 * Exports all reading progress and bookmarks as a JSON string.
 */
export async function generateBackup(): Promise<string> {
  const books = await getAllBooks();
  const progress = await getAllProgress();
  const bookmarks = await getAllBookmarks();

  const backup: BackupData = {
    version: BACKUP_VERSION,
    app: 'BookReaderMobile',
    exportDate: new Date().toISOString(),
    books: books.map(b => ({
      id: b.id,
      title: b.title,
      author: b.author,
      format: b.format,
      pageCount: b.pageCount,
    })),
    progress,
    bookmarks,
  };

  return JSON.stringify(backup, null, 2);
}

/**
 * Triggers a browser download of the backup file.
 */
export function downloadBackupFile(jsonString: string): void {
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `book-reader-backup-${dateStr}.json`;
  const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export interface RestoreResult {
  restoredMatched: number;
  unmatchedPreserved: number;
  totalBookmarks: number;
  totalProgress: number;
}

/**
 * Validates and imports a JSON backup, matching by content fingerprint (bookId).
 * Preserves unmatched records in IndexedDB for books not yet imported.
 */
export async function restoreBackup(jsonString: string): Promise<RestoreResult> {
  let parsed: any;
  try {
    parsed = JSON.parse(jsonString);
  } catch (err) {
    throw new Error('Invalid JSON format. Please select a valid backup file.');
  }

  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.progress) || !Array.isArray(parsed.bookmarks)) {
    throw new Error('Invalid backup schema: Missing progress or bookmarks arrays.');
  }

  const progressList = parsed.progress as ReadingProgress[];
  const bookmarkList = parsed.bookmarks as Bookmark[];

  let restoredMatched = 0;
  let unmatchedPreserved = 0;

  // Group by bookId
  const bookIds = new Set<string>();
  progressList.forEach(p => p.bookId && bookIds.add(p.bookId));
  bookmarkList.forEach(b => b.bookId && bookIds.add(b.bookId));

  for (const bookId of bookIds) {
    const existingBook = await getBook(bookId);
    const bookProgress = progressList.find(p => p.bookId === bookId);
    const bookBookmarks = bookmarkList.filter(b => b.bookId === bookId);

    if (existingBook) {
      // Book is already present in library! Directly restore progress and bookmarks.
      if (bookProgress) {
        // Validate restored page number
        const validPage = existingBook.pageCount > 0 
          ? Math.min(Math.max(1, bookProgress.pageIndex), existingBook.pageCount) 
          : bookProgress.pageIndex;
        
        await saveProgress({
          ...bookProgress,
          pageIndex: validPage,
          updatedAt: Date.now()
        });
      }

      for (const bm of bookBookmarks) {
        await saveBookmark(bm);
      }
      restoredMatched++;
    } else {
      // Book not currently imported on this device.
      // Save to unmatchedBackups so when the user imports this book later, progress is restored!
      await saveUnmatchedBackup(bookId, {
        progress: bookProgress,
        bookmarks: bookBookmarks
      });
      unmatchedPreserved++;
    }
  }

  return {
    restoredMatched,
    unmatchedPreserved,
    totalBookmarks: bookmarkList.length,
    totalProgress: progressList.length,
  };
}
