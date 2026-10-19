import { openDB, type IDBPDatabase } from 'idb';
import type { Book, ReadingProgress, Bookmark, ReaderSettings, Mark, Review, ChapterAction, VocabWord, ReadingSession, IndexedPage, SearchResult } from '../types';

const DB_NAME = 'book_reader_db';
const DB_VERSION = 6;

export const DEFAULT_SETTINGS: ReaderSettings = {
  theme: 'dark',
  pdfPageFilter: 'normal',
  fontSize: 18,
  lineHeight: 1.6,
  fontFamily: 'serif',
  pdfFitMode: 'width',
  tapToTurn: true,
  dailyGoalMinutes: 15,
  lineWidth: 680,
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

        // Marks store (highlights & notes)
        if (!db.objectStoreNames.contains('marks')) {
          const markStore = db.createObjectStore('marks', { keyPath: 'id' });
          markStore.createIndex('bookId', 'bookId');
          markStore.createIndex('createdAt', 'createdAt');
        }

        // Search pages index store
        if (!db.objectStoreNames.contains('pages')) {
          const pageStore = db.createObjectStore('pages', { keyPath: 'id', autoIncrement: true });
          pageStore.createIndex('bookId', 'bookId');
        }

        // Unmatched backups store (holds imported progress/bookmarks for books not yet added)
        if (!db.objectStoreNames.contains('unmatchedBackups')) {
          db.createObjectStore('unmatchedBackups', { keyPath: 'bookId' });
        }

        // Settings store
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }

        // Reviews store for spaced-repetition
        if (!db.objectStoreNames.contains('reviews')) {
          const reviewStore = db.createObjectStore('reviews', { keyPath: 'markId' });
          reviewStore.createIndex('due', 'due');
        }

        // Actions store for chapter action steps
        if (!db.objectStoreNames.contains('actions')) {
          const actionStore = db.createObjectStore('actions', { keyPath: 'id' });
          actionStore.createIndex('book_id', 'book_id');
          actionStore.createIndex('done', 'done');
          actionStore.createIndex('created', 'created');
        }

        // Vocab store for saved dictionary words
        if (!db.objectStoreNames.contains('vocab')) {
          const vocabStore = db.createObjectStore('vocab', { keyPath: 'id' });
          vocabStore.createIndex('word', 'word');
          vocabStore.createIndex('book', 'book');
          vocabStore.createIndex('date', 'date');
        }

        // Sessions store for reading time tracking
        if (!db.objectStoreNames.contains('sessions')) {
          const sessionStore = db.createObjectStore('sessions', { keyPath: 'id' });
          sessionStore.createIndex('book_id', 'book_id');
          sessionStore.createIndex('start', 'start');
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
  const tx = db.transaction(['books', 'bookBlobs', 'progress', 'bookmarks', 'marks', 'pages'], 'readwrite');
  
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

  // Delete all marks for this book
  const markIndex = tx.objectStore('marks').index('bookId');
  let mCursor = await markIndex.openCursor(IDBKeyRange.only(id));
  while (mCursor) {
    await mCursor.delete();
    mCursor = await mCursor.continue();
  }

  // Delete all indexed search pages for this book
  const pageIndex = tx.objectStore('pages').index('bookId');
  let pCursor = await pageIndex.openCursor(IDBKeyRange.only(id));
  while (pCursor) {
    await pCursor.delete();
    pCursor = await pCursor.continue();
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

// ── Marks (EPUB & Book Highlights) ─────────────────────────────────

export async function saveMark(mark: Mark): Promise<void> {
  const db = await getDb();
  await db.put('marks', mark);
}

export async function getMarks(bookId: string): Promise<Mark[]> {
  const db = await getDb();
  const marks = await db.getAllFromIndex('marks', 'bookId', bookId);
  // Sort in reading order (by chapterIndex, then scrollY if loc is "ch|scroll")
  return marks.sort((a, b) => {
    const parseLoc = (loc: string) => {
      const parts = loc.split('|').map(Number);
      return { ch: isNaN(parts[0]) ? 0 : parts[0], scroll: isNaN(parts[1]) ? 0 : parts[1] };
    };
    const locA = parseLoc(a.loc);
    const locB = parseLoc(b.loc);
    if (locA.ch !== locB.ch) return locA.ch - locB.ch;
    return locA.scroll - locB.scroll;
  });
}

export async function getAllMarks(): Promise<Mark[]> {
  const db = await getDb();
  return db.getAll('marks');
}

export async function deleteMark(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['marks', 'reviews'], 'readwrite');
  await tx.objectStore('marks').delete(id);
  // Also delete the associated review if any
  try { await tx.objectStore('reviews').delete(id); } catch (_) { /* no review */ }
  await tx.done;
}

// ── Full-Text Search Indexing ───────────────────────────────────────

export async function isBookIndexed(bookId: string): Promise<boolean> {
  const db = await getDb();
  const count = await db.countFromIndex('pages', 'bookId', bookId);
  return count > 0;
}

export async function indexBookPages(
  bookId: string,
  pages: { loc: string; text: string }[]
): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('pages', 'readwrite');
  const store = tx.objectStore('pages');

  // Clear any existing pages for this book first
  const pageIndex = store.index('bookId');
  let cursor = await pageIndex.openCursor(IDBKeyRange.only(bookId));
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }

  // Insert new pages
  for (const p of pages) {
    if (p.text.trim()) {
      await store.add({
        bookId,
        loc: p.loc,
        text: p.text,
      });
    }
  }

  await tx.done;
}

export async function searchPages(query: string, filterBookId?: string): Promise<SearchResult[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const db = await getDb();
  const books = await getAllBooks();
  const bookMap = new Map(books.map((b) => [b.id, b]));

  let pages: IndexedPage[] = [];
  if (filterBookId) {
    pages = await db.getAllFromIndex('pages', 'bookId', filterBookId);
  } else {
    pages = await db.getAll('pages');
  }

  const results: SearchResult[] = [];
  for (const page of pages) {
    const textLower = page.text.toLowerCase();
    const idx = textLower.indexOf(q);
    if (idx !== -1) {
      const book = bookMap.get(page.bookId);
      if (!book) continue;

      const start = Math.max(0, idx - 40);
      const end = Math.min(page.text.length, idx + q.length + 60);
      const matchWord = page.text.slice(idx, idx + q.length);
      const pre = (start > 0 ? '...' : '') + page.text.slice(start, idx);
      const post = page.text.slice(idx + q.length, end) + (end < page.text.length ? '...' : '');
      const snippet = `${pre}<b>${matchWord}</b>${post}`;

      results.push({
        bookId: page.bookId,
        bookTitle: book.title,
        format: book.format,
        loc: page.loc,
        snippet,
      });

      if (results.length >= 60) break;
    }
  }

  return results;
}

// ── Reviews (Spaced Repetition) ─────────────────────────────────────

function getTodayDateString(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Create a review entry for a mark, due tomorrow with interval 1. */
export async function createReview(markId: string): Promise<void> {
  const db = await getDb();
  const existing = await db.get('reviews', markId);
  if (existing) return; // Don't overwrite existing review schedule
  const review: Review = {
    markId,
    due: addDays(1),
    intervalDays: 1,
  };
  await db.put('reviews', review);
}

/** Get the count of reviews due today or earlier. */
export async function getDueReviewCount(): Promise<number> {
  const db = await getDb();
  const today = getTodayDateString();
  const all = await db.getAll('reviews');
  return all.filter((r: Review) => r.due <= today).length;
}

/** Get up to `limit` review cards that are due today or earlier, joined with mark + book data. */
export async function getDueReviews(limit = 10): Promise<{
  markId: string;
  due: string;
  intervalDays: number;
  quote: string;
  note?: string;
  bookTitle: string;
}[]> {
  const db = await getDb();
  const today = getTodayDateString();
  const allReviews = await db.getAll('reviews');
  const dueReviews = (allReviews as Review[]).filter((r) => r.due <= today);
  dueReviews.sort((a, b) => a.due.localeCompare(b.due));
  const limited = dueReviews.slice(0, limit);

  const books = await getAllBooks();
  const bookMap = new Map(books.map((b) => [b.id, b.title]));

  const results: {
    markId: string;
    due: string;
    intervalDays: number;
    quote: string;
    note?: string;
    bookTitle: string;
  }[] = [];

  for (const rev of limited) {
    const mark = await db.get('marks', rev.markId) as Mark | undefined;
    if (!mark) continue;
    results.push({
      markId: rev.markId,
      due: rev.due,
      intervalDays: rev.intervalDays,
      quote: mark.quote,
      note: mark.note,
      bookTitle: bookMap.get(mark.bookId) || 'Unknown',
    });
  }

  return results;
}

/** Rate a review card: forgot, hard, good, or easy. */
export async function rateReview(
  markId: string,
  rating: 'forgot' | 'hard' | 'good' | 'easy'
): Promise<void> {
  const db = await getDb();
  const review = await db.get('reviews', markId) as Review | undefined;
  if (!review) return;

  let newInterval: number;
  switch (rating) {
    case 'forgot':
      newInterval = 1;
      break;
    case 'hard':
      newInterval = Math.ceil(review.intervalDays * 1.2);
      break;
    case 'good':
      newInterval = Math.ceil(review.intervalDays * 2);
      break;
    case 'easy':
      newInterval = Math.ceil(review.intervalDays * 3);
      break;
  }

  await db.put('reviews', {
    markId,
    due: addDays(newInterval),
    intervalDays: newInterval,
  });
}

// ── Chapter Actions ──────────────────────────────────────────────────

/** Store an action step created upon finishing a chapter. */
export async function saveAction(
  bookId: string,
  loc: string,
  text: string
): Promise<ChapterAction> {
  const db = await getDb();
  const action: ChapterAction = {
    id: crypto.randomUUID(),
    book_id: bookId,
    loc,
    text: text.trim(),
    created: new Date().toISOString(),
    done: 0,
  };
  await db.put('actions', action);
  return action;
}

/** Get all chapter actions, optionally filtered by bookId, with bookTitle populated. */
export async function getActions(filterBookId?: string): Promise<ChapterAction[]> {
  const db = await getDb();
  let allActions: ChapterAction[] = [];
  if (filterBookId) {
    allActions = await db.getAllFromIndex('actions', 'book_id', filterBookId);
  } else {
    allActions = await db.getAll('actions');
  }

  // Populate book title
  const books = await getAllBooks();
  const bookMap = new Map(books.map((b) => [b.id, b.title]));

  allActions.forEach((act) => {
    act.bookTitle = bookMap.get(act.book_id) || 'Unknown Book';
  });

  // Sort: newest first
  return allActions.sort((a, b) => b.created.localeCompare(a.created));
}

/** Set or toggle done status for an action. */
export async function setActionDone(id: string, done: number): Promise<void> {
  const db = await getDb();
  const item = (await db.get('actions', id)) as ChapterAction | undefined;
  if (!item) return;
  item.done = done;
  await db.put('actions', item);
}

/** Delete an action by id. */
export async function deleteAction(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('actions', id);
}

// ── Vocabulary (Saved Dictionary Words) ──────────────────────────────

/** Store a vocabulary word, definition, book, and date in the vocab table. */
export async function saveVocabWord(
  word: string,
  definition: string,
  book: string
): Promise<VocabWord> {
  const db = await getDb();
  const vocab: VocabWord = {
    id: crypto.randomUUID(),
    word: word.trim(),
    definition: definition.trim(),
    book: book.trim() || 'General',
    date: new Date().toISOString(),
  };
  await db.put('vocab', vocab);
  return vocab;
}

/** Get all saved vocabulary words, sorted with newest first. */
export async function getAllVocab(): Promise<VocabWord[]> {
  const db = await getDb();
  const all = (await db.getAll('vocab')) as VocabWord[];
  return all.sort((a, b) => b.date.localeCompare(a.date));
}

/** Delete a saved vocabulary word by id. */
export async function deleteVocabWord(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('vocab', id);
}

/** Check if a word is already in the vocabulary list. */
export async function isWordSaved(word: string): Promise<boolean> {
  const db = await getDb();
  const normalized = word.trim().toLowerCase();
  const all = (await db.getAll('vocab')) as VocabWord[];
  return all.some((v) => v.word.toLowerCase() === normalized);
}

// ── Reading Sessions & Time Tracking ────────────────────────────────

/** Store a reading session (id, book_id, start, seconds). */
export async function saveSession(
  bookId: string,
  start: string,
  seconds: number
): Promise<ReadingSession | null> {
  if (seconds <= 0) return null;
  const db = await getDb();
  const session: ReadingSession = {
    id: crypto.randomUUID(),
    book_id: bookId,
    start,
    seconds: Math.round(seconds),
  };
  await db.put('sessions', session);
  return session;
}

/** Get all reading sessions. */
export async function getAllSessions(): Promise<ReadingSession[]> {
  const db = await getDb();
  return db.getAll('sessions');
}

/** Get reading sessions for a specific book. */
export async function getBookSessions(bookId: string): Promise<ReadingSession[]> {
  const db = await getDb();
  return db.getAllFromIndex('sessions', 'book_id', bookId);
}

/** Get total reading seconds accumulated today (local date). */
export async function getTodayReadingSeconds(): Promise<number> {
  const db = await getDb();
  const all = (await db.getAll('sessions')) as ReadingSession[];
  const todayStr = getTodayDateString(); // "YYYY-MM-DD"
  
  return all
    .filter((s) => {
      try {
        const d = new Date(s.start);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}` === todayStr;
      } catch (_) {
        return false;
      }
    })
    .reduce((total, s) => total + (s.seconds || 0), 0);
}

