import { openDB, type IDBPDatabase } from 'idb';
import type { Book, ReadingProgress, Bookmark, ReaderSettings } from '../types';

const DB_NAME = 'book_reader_db';
const DB_VERSION = 1;

export const DEFAULT_SETTINGS: ReaderSettings = {
  theme: 'dark',
  pdfPageFilter: 'normal',
  fontSize: 18,
  lineHeight: 1.6,
  fontFamily: 'serif',
  pdfFitMode: 'width',
  tapToTurn: true,
};

let dbPromise: Promise<IDBPDatabase> | null = null;

export function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Books metadata store
        if (!db.objectStoreNames.contains('books')) {
          const bookStore = db.createObjectStore('books', { keyPath: 'id' });
          bookStore.createIndex('addedAt', 'addedAt');
          bookStore.createIndex('lastOpenedAt', 'lastOpenedAt');
        }

        // Book binary data store (separated so querying library doesn't load large files into RAM)
        if (!db.objectStoreNames.contains('bookBlobs')) {
          db.createObjectStore('bookBlobs', { keyPath: 'id' });
        }

        // Reading progress store (one record per bookId)
        if (!db.objectStoreNames.contains('progress')) {
          db.createObjectStore('progress', { keyPath: 'bookId' });
        }

        // Bookmarks store (multiple bookmarks per bookId)
        if (!db.objectStoreNames.contains('bookmarks')) {
          const bmStore = db.createObjectStore('bookmarks', { keyPath: 'id' });
          bmStore.createIndex('bookId', 'bookId');
          bmStore.createIndex('createdAt', 'createdAt');
        }

        // Unmatched backups store (holds imported progress/bookmarks for books not yet added)
        if (!db.objectStoreNames.contains('unmatchedBackups')) {
          db.createObjectStore('unmatchedBackups', { keyPath: 'bookId' });
        }

        // Settings store
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      },
    });
  }
  return dbPromise;
}

// ── Books & Blobs ──────────────────────────────────────────────────

export async function saveBook(book: Book, blob: Blob): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['books', 'bookBlobs', 'unmatchedBackups', 'progress', 'bookmarks'], 'readwrite');
  
  await tx.objectStore('books').put(book);
  await tx.objectStore('bookBlobs').put({
    id: book.id,
    blob,
    mimeType: blob.type || 'application/octet-stream'
  });

  // Check if an unmatched backup exists for this book fingerprint
  const unmatched = await tx.objectStore('unmatchedBackups').get(book.id);
  if (unmatched) {
    if (unmatched.progress) {
      await tx.objectStore('progress').put(unmatched.progress);
    }
    if (unmatched.bookmarks && Array.isArray(unmatched.bookmarks)) {
      for (const bm of unmatched.bookmarks) {
        await tx.objectStore('bookmarks').put(bm);
      }
    }
    await tx.objectStore('unmatchedBackups').delete(book.id);
  }

  await tx.done;
}

export async function getBook(id: string): Promise<Book | undefined> {
  const db = await getDb();
  return db.get('books', id);
}

export async function getAllBooks(): Promise<Book[]> {
  const db = await getDb();
  const books = await db.getAll('books');
  // Sort by lastOpenedAt descending, then addedAt descending
  return books.sort((a, b) => (b.lastOpenedAt || 0) - (a.lastOpenedAt || 0) || (b.addedAt || 0) - (a.addedAt || 0));
}

export async function updateBookMetadata(book: Partial<Book> & { id: string }): Promise<void> {
  const db = await getDb();
  const existing = await db.get('books', book.id);
  if (existing) {
    await db.put('books', { ...existing, ...book });
  }
}

export async function getBookBlob(id: string): Promise<Blob | undefined> {
  const db = await getDb();
  const record = await db.get('bookBlobs', id);
  return record?.blob;
}

export async function deleteBook(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['books', 'bookBlobs', 'progress', 'bookmarks'], 'readwrite');
  
  await tx.objectStore('books').delete(id);
  await tx.objectStore('bookBlobs').delete(id);
  await tx.objectStore('progress').delete(id);

  // Delete all bookmarks for this book
  const bmIndex = tx.objectStore('bookmarks').index('bookId');
  let cursor = await bmIndex.openCursor(IDBKeyRange.only(id));
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }

  await tx.done;
}

// ── Reading Progress ───────────────────────────────────────────────

export async function saveProgress(progress: ReadingProgress): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['progress', 'books'], 'readwrite');
  await tx.objectStore('progress').put(progress);
  
  // Update lastOpenedAt on the book
  const book = await tx.objectStore('books').get(progress.bookId);
  if (book) {
    book.lastOpenedAt = progress.updatedAt || Date.now();
    await tx.objectStore('books').put(book);
  }
  await tx.done;
}

export async function getProgress(bookId: string): Promise<ReadingProgress | undefined> {
  const db = await getDb();
  return db.get('progress', bookId);
}

export async function getAllProgress(): Promise<ReadingProgress[]> {
  const db = await getDb();
  return db.getAll('progress');
}

// ── Bookmarks ──────────────────────────────────────────────────────

export async function saveBookmark(bookmark: Bookmark): Promise<void> {
  const db = await getDb();
  await db.put('bookmarks', bookmark);
}

export async function getBookmarks(bookId: string): Promise<Bookmark[]> {
  const db = await getDb();
  const bms = await db.getAllFromIndex('bookmarks', 'bookId', bookId);
  // Sort by pageIndex ascending
  return bms.sort((a, b) => a.pageIndex - b.pageIndex || a.scrollOffset - b.scrollOffset);
}

export async function getAllBookmarks(): Promise<Bookmark[]> {
  const db = await getDb();
  return db.getAll('bookmarks');
}

export async function deleteBookmark(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('bookmarks', id);
}

// ── Unmatched Backups ──────────────────────────────────────────────

export async function saveUnmatchedBackup(bookId: string, data: { progress?: ReadingProgress; bookmarks?: Bookmark[] }): Promise<void> {
  const db = await getDb();
  await db.put('unmatchedBackups', { bookId, ...data });
}

export async function getUnmatchedBackupsCount(): Promise<number> {
  const db = await getDb();
  return db.count('unmatchedBackups');
}

// ── Settings ───────────────────────────────────────────────────────

export async function getSettings(): Promise<ReaderSettings> {
  const db = await getDb();
  const saved = await db.get('settings', 'user_settings');
  return { ...DEFAULT_SETTINGS, ...(saved?.value || {}) };
}

export async function saveSettings(settings: Partial<ReaderSettings>): Promise<ReaderSettings> {
  const db = await getDb();
  const current = await getSettings();
  const updated = { ...current, ...settings };
  await db.put('settings', { key: 'user_settings', value: updated });
  return updated;
}
