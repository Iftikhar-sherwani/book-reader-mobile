export type BookFormat = 'pdf' | 'epub' | 'txt';

export interface Book {
  id: string; // SHA-256 content fingerprint
  title: string;
  author: string;
  format: BookFormat;
  fileSize: number;
  addedAt: number;
  lastOpenedAt: number;
  pageCount: number;
  coverUrl?: string; // Optional data URL or cached cover image
}

export interface ReadingProgress {
  bookId: string;
  location: string; // Page number for PDF (e.g. "12"), chapter href/index for EPUB, block index for TXT
  pageIndex: number; // 1-based page number or chapter index
  scrollOffset: number; // Vertical scroll position or percentage (0-100)
  percentage: number; // 0 to 100
  updatedAt: number;
}

export interface Bookmark {
  id: string;
  bookId: string;
  pageIndex: number;
  location: string;
  scrollOffset: number;
  title: string;
  snippet?: string;
  createdAt: number;
}

export interface ReaderSettings {
  theme: 'dark' | 'light' | 'sepia';
  pdfPageFilter: 'normal' | 'warm' | 'night'; // For PDF canvas
  fontSize: number; // In px for EPUB/TXT (default 18)
  lineHeight: number; // Default 1.6
  fontFamily: 'serif' | 'sans-serif';
  pdfFitMode: 'width' | 'page';
  tapToTurn: boolean;
}

export interface StorageStats {
  supported: boolean;
  persisted: boolean;
  usageBytes: number;
  quotaBytes: number;
}

export interface BackupData {
  version: number;
  exportDate: string;
  app: string;
  books: {
    id: string;
    title: string;
    author: string;
    format: BookFormat;
    pageCount: number;
  }[];
  progress: ReadingProgress[];
  bookmarks: Bookmark[];
}
