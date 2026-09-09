import React, { useState, useEffect, useCallback } from 'react';
import type { Book, ReadingProgress, ReaderSettings, BookFormat } from './types';
import {
  getAllBooks,
  getAllProgress,
  saveBook,
  getBook,
  deleteBook,
  getSettings,
  saveSettings,
  DEFAULT_SETTINGS,
} from './services/db';
import { computeFileFingerprint } from './services/fingerprint';
import { loadPdfDocument } from './services/pdfService';
import { parseEpub } from './services/epubService';
import { parseTxt } from './services/txtService';
import { Header } from './components/Header';
import { LibraryView } from './components/LibraryView';
import { ReaderView } from './components/ReaderView';
import { SettingsModal } from './components/SettingsModal';
import { DuplicateBookModal } from './components/DuplicateBookModal';

export const App: React.FC = () => {
  const [books, setBooks] = useState<Book[]>([]);
  const [progressMap, setProgressMap] = useState<Map<string, ReadingProgress>>(new Map());
  const [currentBook, setCurrentBook] = useState<Book | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals & Drawers
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isBookmarksOpen, setIsBookmarksOpen] = useState(false);
  const [duplicateBook, setDuplicateBook] = useState<Book | null>(null);

  // Settings
  const [settings, setSettings] = useState<ReaderSettings>(DEFAULT_SETTINGS);

  // Importing state
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  // PWA & Network state
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isOfflineReady, setIsOfflineReady] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  // 1. Initial Load: Books, Progress, Settings, Standalone check
  const refreshLibrary = useCallback(async () => {
    try {
      const [loadedBooks, loadedProgress, loadedSettings] = await Promise.all([
        getAllBooks(),
        getAllProgress(),
        getSettings(),
      ]);

      setBooks(loadedBooks);
      const pMap = new Map<string, ReadingProgress>();
      loadedProgress.forEach((p) => pMap.set(p.bookId, p));
      setProgressMap(pMap);
      setSettings(loadedSettings);
      document.documentElement.setAttribute('data-theme', loadedSettings.theme);
    } catch (err) {
      console.error('Failed to load library:', err);
    }
  }, []);

  useEffect(() => {
    refreshLibrary();

    // Check standalone mode
    if (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true
    ) {
      setIsStandalone(true);
    }

    // Network listeners
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Capture PWA install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, [refreshLibrary]);

  // 2. Service Worker registration & Offline Ready detection
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((registration) => {
        if (registration.active) {
          setIsOfflineReady(true);
        }

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                setUpdateAvailable(true);
                setWaitingWorker(newWorker);
              }
            });
          }
        });
      });

      // Handle controller change (after update activation)
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });
    }
  }, []);

  // Update app safely
  const handleApplyUpdate = () => {
    if (waitingWorker) {
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    }
  };

  // 3. Import Book Handler
  const handleImportFile = async (file: File) => {
    setIsImporting(true);
    setImportError(null);

    try {
      // Step 1: Compute stable content fingerprint
      const fingerprint = await computeFileFingerprint(file);

      // Step 2: Check for duplicate import
      const existing = await getBook(fingerprint);
      if (existing) {
        setDuplicateBook(existing);
        setIsImporting(false);
        return;
      }

      // Step 3: Determine format
      const fileNameLower = file.name.toLowerCase();
      let format: BookFormat = 'pdf';
      if (fileNameLower.endsWith('.epub')) {
        format = 'epub';
      } else if (fileNameLower.endsWith('.txt')) {
        format = 'txt';
      } else if (fileNameLower.endsWith('.pdf')) {
        format = 'pdf';
      } else {
        throw new Error('Unsupported file format. Please choose a PDF, EPUB, or TXT file.');
      }

      // Step 4: Extract initial title, author, and page count
      let title = file.name.replace(/\.[^/.]+$/, '');
      let author = '';
      let pageCount = 0;

      if (format === 'pdf') {
        try {
          const pdfDoc = await loadPdfDocument(file);
          pageCount = pdfDoc.numPages;
          // Attempt to extract title/author from metadata
          const meta = await pdfDoc.getMetadata();
          if (meta?.info) {
            const info = meta.info as any;
            if (info.Title && typeof info.Title === 'string' && info.Title.trim()) {
              title = info.Title.trim();
            }
            if (info.Author && typeof info.Author === 'string' && info.Author.trim()) {
              author = info.Author.trim();
            }
          }
        } catch (pdfErr: any) {
          // If encrypted, still proceed; reader will prompt for password
          if (pdfErr?.name !== 'PasswordException') {
            throw pdfErr;
          }
        }
      } else if (format === 'epub') {
        try {
          const parsed = await parseEpub(file);
          title = parsed.title || title;
          author = parsed.author || '';
          pageCount = parsed.totalChapters;
        } catch (epubErr: any) {
          throw new Error('Could not parse EPUB file: ' + epubErr.message);
        }
      } else if (format === 'txt') {
        const parsed = await parseTxt(file, file.name);
        title = parsed.title || title;
        pageCount = parsed.totalPageCount;
      }

      const newBook: Book = {
        id: fingerprint,
        title,
        author,
        format,
        fileSize: file.size,
        addedAt: Date.now(),
        lastOpenedAt: Date.now(),
        pageCount,
      };

      // Step 5: Save book & blob to IndexedDB
      await saveBook(newBook, file);
      await refreshLibrary();

      // Automatically open newly imported book
      setCurrentBook(newBook);
    } catch (err: any) {
      setImportError(err?.message || 'Failed to import book. Please check if the file is valid.');
    } finally {
      setIsImporting(false);
    }
  };

  // Delete Book Handler
  const handleDeleteBook = async (book: Book) => {
    try {
      await deleteBook(book.id);
      if (currentBook?.id === book.id) {
        setCurrentBook(null);
      }
      await refreshLibrary();
    } catch (err) {
      console.error('Failed to delete book:', err);
    }
  };

  // Settings & Theme Updates
  const handleUpdateSettings = async (newSettings: Partial<ReaderSettings>) => {
    const updated = await saveSettings(newSettings);
    setSettings(updated);
    document.documentElement.setAttribute('data-theme', updated.theme);
  };

  const handleToggleTheme = () => {
    const nextTheme = settings.theme === 'dark' ? 'light' : settings.theme === 'light' ? 'sepia' : 'dark';
    handleUpdateSettings({ theme: nextTheme });
  };

  return (
    <div className="app-container">
      {/* Universal Header */}
      <Header
        isReading={Boolean(currentBook)}
        bookTitle={currentBook?.title}
        isOfflineReady={isOfflineReady}
        isOnline={isOnline}
        updateAvailable={updateAvailable}
        settings={settings}
        onBackToLibrary={() => {
          setCurrentBook(null);
          refreshLibrary();
        }}
        onOpenBookmarks={() => setIsBookmarksOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onApplyUpdate={handleApplyUpdate}
        onToggleTheme={handleToggleTheme}
      />

      {/* Main View: Library or Active Reader */}
      {currentBook ? (
        <ReaderView
          book={currentBook}
          settings={settings}
          onBackToLibrary={() => {
            setCurrentBook(null);
            refreshLibrary();
          }}
          isBookmarksOpen={isBookmarksOpen}
          onCloseBookmarks={() => setIsBookmarksOpen(false)}
        />
      ) : (
        <LibraryView
          books={books}
          progressMap={progressMap}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSelectBook={(book) => setCurrentBook(book)}
          onImportFile={handleImportFile}
          onDeleteBook={handleDeleteBook}
          isImporting={isImporting}
          importError={importError}
          deferredPrompt={deferredPrompt}
          isStandalone={isStandalone}
        />
      )}

      {/* Settings Modal */}
      {isSettingsOpen && (
        <SettingsModal
          settings={settings}
          onUpdateSettings={handleUpdateSettings}
          onClose={() => setIsSettingsOpen(false)}
          onDataRestored={refreshLibrary}
        />
      )}

      {/* Duplicate Book Detected Modal */}
      {duplicateBook && (
        <DuplicateBookModal
          existingBook={duplicateBook}
          onOpenExisting={() => {
            const bookToOpen = duplicateBook;
            setDuplicateBook(null);
            setCurrentBook(bookToOpen);
          }}
          onCancel={() => setDuplicateBook(null)}
        />
      )}
    </div>
  );
};
export default App;
