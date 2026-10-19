import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Book, ReadingProgress, Bookmark, ReaderSettings, Mark } from '../types';
import {
  getBookBlob,
  getProgress,
  saveProgress,
  getBookmarks,
  saveBookmark,
  deleteBookmark,
  getMarks,
  saveMark,
  deleteMark,
  updateBookMetadata,
  createReview,
  saveAction,
  saveSession,
} from '../services/db';
import { indexBook } from '../services/indexerService';
import { PdfReader } from './PdfReader';
import { EpubReader } from './EpubReader';
import { TxtReader } from './TxtReader';
import { BookmarksDrawer } from './BookmarksDrawer';
import { MarksDrawer } from './MarksDrawer';
import { JumpToPageModal } from './JumpToPageModal';
import { ChapterActionDialog } from './ChapterActionDialog';
import { DictionaryPopup } from './DictionaryPopup';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Bookmark as BookmarkIcon,
  Highlighter,
  AlertTriangle,
  Loader2,
  ArrowLeft,
  Target,
} from 'lucide-react';

interface ReaderViewProps {
  book: Book;
  settings: ReaderSettings;
  onBackToLibrary: () => void;
  isBookmarksOpen: boolean;
  onCloseBookmarks: () => void;
  isMarksOpen?: boolean;
  onCloseMarks?: () => void;
  onOpenMarks?: () => void;
  onSessionRecorded?: (seconds: number) => void;
  onUpdateSettings?: (newSettings: Partial<ReaderSettings>) => void;
  onFocusModeChange?: (isFocus: boolean) => void;
}

export const ReaderView: React.FC<ReaderViewProps> = ({
  book,
  settings,
  onBackToLibrary,
  isBookmarksOpen,
  onCloseBookmarks,
  isMarksOpen,
  onCloseMarks,
  onOpenMarks,
  onSessionRecorded,
  onUpdateSettings,
  onFocusModeChange,
}) => {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reading Time Tracking (Feature 11)
  // - Starts when book is open and window is active.
  // - Stops after 60 seconds with no mouse or key activity.
  // - Stores sessions(id, book_id, start, seconds).
  const sessionStartTimeRef = useRef<string>(new Date().toISOString());
  const activeSecondsRef = useRef<number>(0);
  const lastActivityRef = useRef<number>(Date.now());
  const windowActiveRef = useRef<boolean>(
    typeof document !== 'undefined' ? document.visibilityState === 'visible' : true
  );

  const flushSession = useCallback(async () => {
    const sec = activeSecondsRef.current;
    if (sec > 0 && book.id) {
      const startIso = sessionStartTimeRef.current;
      activeSecondsRef.current = 0;
      sessionStartTimeRef.current = new Date().toISOString();
      try {
        await saveSession(book.id, startIso, sec);
        onSessionRecorded?.(sec);
      } catch (err) {
        console.warn('Failed to save reading session:', err);
      }
    }
  }, [book.id, onSessionRecorded]);

  useEffect(() => {
    sessionStartTimeRef.current = new Date().toISOString();
    activeSecondsRef.current = 0;
    lastActivityRef.current = Date.now();
    windowActiveRef.current = document.visibilityState === 'visible';

    const onUserActivity = () => {
      lastActivityRef.current = Date.now();
    };

    const onVisibilityChange = () => {
      const isVisible = document.visibilityState === 'visible';
      windowActiveRef.current = isVisible;
      if (!isVisible) {
        flushSession();
      } else {
        lastActivityRef.current = Date.now();
        sessionStartTimeRef.current = new Date().toISOString();
      }
    };

    const onFocus = () => {
      windowActiveRef.current = true;
      lastActivityRef.current = Date.now();
    };

    const onBlur = () => {
      windowActiveRef.current = false;
      flushSession();
    };

    window.addEventListener('mousemove', onUserActivity, { passive: true });
    window.addEventListener('mousedown', onUserActivity, { passive: true });
    window.addEventListener('keydown', onUserActivity, { passive: true });
    window.addEventListener('touchstart', onUserActivity, { passive: true });
    window.addEventListener('scroll', onUserActivity, { passive: true });

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);

    const interval = setInterval(() => {
      const isWindowActive = windowActiveRef.current && document.visibilityState === 'visible';
      const isWithin60s = Date.now() - lastActivityRef.current <= 60000;

      if (isWindowActive && isWithin60s) {
        activeSecondsRef.current += 1;
        // Flush every 30 seconds for persistence
        if (activeSecondsRef.current >= 30) {
          flushSession();
        }
      }
    }, 1000);

    return () => {
      clearInterval(interval);
      window.removeEventListener('mousemove', onUserActivity);
      window.removeEventListener('mousedown', onUserActivity);
      window.removeEventListener('keydown', onUserActivity);
      window.removeEventListener('touchstart', onUserActivity);
      window.removeEventListener('scroll', onUserActivity);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
      flushSession();
    };
  }, [book.id, flushSession]);

  // Navigation state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(book.pageCount || 1);
  const [scrollOffset, setScrollOffset] = useState<number>(0);
  const [zoomMultiplier, setZoomMultiplier] = useState<number>(1.0);

  // UI state
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isJumpModalOpen, setIsJumpModalOpen] = useState(false);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<{
    locationLabel: string;
    onConfirm?: () => void;
  } | null>(null);
  const [dictionaryWord, setDictionaryWord] = useState<string | null>(null);
  // Feature 12: Focus Mode (toggled with F key)
  const [isFocusMode, setIsFocusMode] = useState(false);

  useEffect(() => {
    onFocusModeChange?.(isFocusMode);
  }, [isFocusMode, onFocusModeChange]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        setIsFocusMode((prev) => {
          const next = !prev;
          showToast(next ? '✦ Focus Mode (Press F or Esc to exit)' : '✦ Exited Focus Mode');
          return next;
        });
      } else if (e.key === 'Escape') {
        setIsFocusMode(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const currentPageRef = useRef(currentPage);
  const scrollOffsetRef = useRef(scrollOffset);
  const totalPagesRef = useRef(totalPages);

  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  useEffect(() => {
    scrollOffsetRef.current = scrollOffset;
  }, [scrollOffset]);

  useEffect(() => {
    totalPagesRef.current = totalPages;
  }, [totalPages]);

  // Show transient toast
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((current) => (current === msg ? null : current));
    }, 2500);
  };

  // 1. Load book blob, initial progress, bookmarks & marks
  useEffect(() => {
    let mounted = true;

    const loadData = async () => {
      try {
        setLoading(true);
        const [bookBlob, savedProgress, savedBookmarks, savedMarks] = await Promise.all([
          getBookBlob(book.id),
          getProgress(book.id),
          getBookmarks(book.id),
          getMarks(book.id),
        ]);

        if (!mounted) return;

        if (!bookBlob) {
          setError('Book file not found in local storage.');
          setLoading(false);
          return;
        }

        setBlob(bookBlob);
        setBookmarks(savedBookmarks);
        setMarks(savedMarks);

        // Restore automatically saved location
        if (savedProgress && savedProgress.pageIndex > 0) {
          const restoredPage = Math.max(1, savedProgress.pageIndex);
          setCurrentPage(restoredPage);
          setScrollOffset(savedProgress.scrollOffset || 0);
          showToast(`✦ Resumed at page ${restoredPage}`);
        } else {
          setCurrentPage(1);
          setScrollOffset(0);
        }

        setLoading(false);

        // Index text in background for search
        indexBook(book, bookBlob, {
          onWarning: (msg) => showToast(`⚠️ ${msg}`),
        });
      } catch (err: any) {
        if (mounted) {
          setError(err?.message || 'Failed to load book data.');
          setLoading(false);
        }
      }
    };

    loadData();

    return () => {
      mounted = false;
    };
  }, [book.id]);

  // 2. Save progress function
  const triggerSaveProgress = useCallback(
    async (page: number, scroll: number, total: number) => {
      if (total <= 0) return;
      const validPage = Math.min(Math.max(1, page), total);
      const percentage = total > 0 ? (validPage / total) * 100 : 0;

      const progress: ReadingProgress = {
        bookId: book.id,
        location: String(validPage),
        pageIndex: validPage,
        scrollOffset: scroll,
        percentage,
        updatedAt: Date.now(),
      };

      try {
        await saveProgress(progress);
      } catch (err) {
        console.warn('Autosave progress failed:', err);
      }
    },
    [book.id]
  );

  // 3. Autosave whenever page changes
  const handlePageChange = useCallback(
    (newPage: number) => {
      const valid = Math.min(Math.max(1, newPage), totalPagesRef.current);
      setCurrentPage(valid);
      setScrollOffset(0);
      triggerSaveProgress(valid, 0, totalPagesRef.current);
    },
    [triggerSaveProgress]
  );

  const handleEpubChapterChange = useCallback(
    (chapterIndex: number, scroll: number) => {
      // If moving to the next chapter in EPUB, prompt: "What will you do with this?"
      if (chapterIndex > currentPageRef.current) {
        setPendingAction({
          locationLabel: `Chapter ${currentPageRef.current}`,
          onConfirm: () => {
            setCurrentPage(chapterIndex);
            setScrollOffset(scroll);
            triggerSaveProgress(chapterIndex, scroll, totalPagesRef.current);
          },
        });
      } else {
        setCurrentPage(chapterIndex);
        setScrollOffset(scroll);
        triggerSaveProgress(chapterIndex, scroll, totalPagesRef.current);
      }
    },
    [triggerSaveProgress]
  );

  const handleNextPageClick = useCallback(() => {
    if (currentPageRef.current >= totalPagesRef.current) return;
    const nextPage = currentPageRef.current + 1;
    if (book.format === 'epub') {
      setPendingAction({
        locationLabel: `Chapter ${currentPageRef.current}`,
        onConfirm: () => {
          handlePageChange(nextPage);
        },
      });
    } else {
      handlePageChange(nextPage);
    }
  }, [book.format, handlePageChange]);

  const handleFinishChapter = useCallback(() => {
    setPendingAction({
      locationLabel: book.format === 'epub' ? `Chapter ${currentPageRef.current}` : `Page ${currentPageRef.current}`,
      onConfirm: () => {},
    });
  }, [book.format]);

  const handleSaveAction = async (actionText: string) => {
    if (pendingAction) {
      try {
        await saveAction(book.id, pendingAction.locationLabel, actionText);
        showToast('✦ Action step saved');
      } catch (err) {
        console.warn('Failed to save action:', err);
      }
      const cb = pendingAction.onConfirm;
      setPendingAction(null);
      if (cb) cb();
    }
  };

  const handleSkipAction = () => {
    if (pendingAction) {
      const cb = pendingAction.onConfirm;
      setPendingAction(null);
      if (cb) cb();
    }
  };

  const handleLookupWord = useCallback((word: string) => {
    const clean = word.trim().replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '');
    if (clean && clean.length >= 1) {
      setDictionaryWord(clean);
    }
  }, []);

  // 4. Save progress on app background / navigation (visibilitychange and pagehide)
  useEffect(() => {
    const handleBackgroundSave = () => {
      triggerSaveProgress(
        currentPageRef.current,
        scrollOffsetRef.current,
        totalPagesRef.current
      );
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        handleBackgroundSave();
      }
    };

    window.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', handleBackgroundSave);

    return () => {
      handleBackgroundSave();
      window.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', handleBackgroundSave);
    };
  }, [triggerSaveProgress]);

  // Handle total page count loaded from document parser
  const handlePageCountLoaded = useCallback(
    (count: number) => {
      setTotalPages(count);
      // If book page count wasn't recorded, update metadata
      if (book.pageCount !== count) {
        updateBookMetadata({ id: book.id, pageCount: count });
      }
      // Re-validate current page against actual count
      if (currentPageRef.current > count && count > 0) {
        setCurrentPage(count);
        triggerSaveProgress(count, 0, count);
      }
    },
    [book.id, book.pageCount, triggerSaveProgress]
  );

  // Manual Bookmark Actions
  const handleAddBookmark = async () => {
    const newBm: Bookmark = {
      id: `${book.id}_bm_${Date.now()}`,
      bookId: book.id,
      pageIndex: currentPage,
      location: String(currentPage),
      scrollOffset: scrollOffset,
      title: `Page ${currentPage}`,
      createdAt: Date.now(),
    };

    await saveBookmark(newBm);
    const updated = await getBookmarks(book.id);
    setBookmarks(updated);
    showToast(`✦ Bookmark saved for page ${currentPage}`);
  };

  const handleSelectBookmark = (bm: Bookmark) => {
    handlePageChange(bm.pageIndex);
    setScrollOffset(bm.scrollOffset || 0);
    onCloseBookmarks();
    showToast(`✦ Restored bookmark (Page ${bm.pageIndex})`);
  };

  const handleDeleteBookmark = async (id: string) => {
    await deleteBookmark(id);
    const updated = await getBookmarks(book.id);
    setBookmarks(updated);
  };

  // Mark handlers
  const handleAddMark = async (
    quote: string,
    color: string,
    note: string,
    chapterIndex: number,
    scrollY: number
  ) => {
    const newMark: Mark = {
      id: crypto.randomUUID(),
      bookId: book.id,
      loc: `${chapterIndex}|${Math.round(scrollY)}`,
      quote,
      color,
      note: note || undefined,
      createdAt: Date.now(),
    };
    try {
      await saveMark(newMark);
      await createReview(newMark.id);
      const updated = await getMarks(book.id);
      setMarks(updated);
      showToast('✦ Selection marked');
    } catch (err) {
      console.warn('Failed to save mark:', err);
    }
  };

  const handleDeleteMark = async (id: string) => {
    try {
      await deleteMark(id);
      const updated = await getMarks(book.id);
      setMarks(updated);
      showToast('Mark deleted');
    } catch (err) {
      console.warn('Failed to delete mark:', err);
    }
  };

  const handleSelectMark = (m: Mark) => {
    const parts = m.loc.split('|');
    const ch = parseInt(parts[0], 10) || 1;
    const scroll = parseFloat(parts[1]) || 0;
    setCurrentPage(ch);
    setScrollOffset(scroll);
    if (onCloseMarks) onCloseMarks();
  };

  // Zoom handlers
  const handleZoomIn = () => {
    setZoomMultiplier((prev) => Math.min(2.5, Math.round((prev + 0.2) * 10) / 10));
  };

  const handleZoomOut = () => {
    setZoomMultiplier((prev) => Math.max(0.7, Math.round((prev - 0.2) * 10) / 10));
  };

  const handleResetZoom = () => {
    setZoomMultiplier(1.0);
  };

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
        <Loader2 size={36} color="var(--accent-gold)" className="spin-slow" />
        <p style={{ color: 'var(--text-secondary)', fontSize: 15 }}>Opening book...</p>
      </div>
    );
  }

  if (error || !blob) {
    return (
      <div style={{ flex: 1, padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 16 }}>
        <AlertTriangle size={48} color="var(--danger)" />
        <div>
          <h3 style={{ fontSize: 18, color: 'var(--text-primary)', marginBottom: 8 }}>Unable to Open Book</h3>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 320, lineHeight: 1.5 }}>
            {error || 'The file could not be read or is corrupted.'}
          </p>
        </div>
        <button className="primary-btn" onClick={onBackToLibrary}>
          <ArrowLeft size={18} />
          <span>Back to Library</span>
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Reader Content Renderers */}
      {book.format === 'pdf' && (
        <PdfReader
          blob={blob}
          currentPage={currentPage}
          totalPages={totalPages}
          settings={settings}
          zoomMultiplier={zoomMultiplier}
          onPageCountLoaded={handlePageCountLoaded}
          onPageChange={handlePageChange}
          onToggleControls={() => setControlsVisible(!controlsVisible)}
          onError={(err) => setError(err)}
        />
      )}

      {book.format === 'epub' && (
        <EpubReader
          blob={blob}
          currentChapter={currentPage}
          initialScrollOffset={scrollOffset}
          settings={settings}
          marks={marks}
          onPageCountLoaded={handlePageCountLoaded}
          onChapterChange={handleEpubChapterChange}
          onAddMark={handleAddMark}
          onToggleControls={() => setControlsVisible(!controlsVisible)}
          onError={(err) => setError(err)}
          onLookupWord={handleLookupWord}
        />
      )}

      {book.format === 'txt' && (
        <TxtReader
          blob={blob}
          bookTitle={book.title}
          currentPage={currentPage}
          settings={settings}
          onPageCountLoaded={handlePageCountLoaded}
          onPageChange={handlePageChange}
          onToggleControls={() => setControlsVisible(!controlsVisible)}
          onError={(err) => setError(err)}
          onLookupWord={handleLookupWord}
        />
      )}

      {/* Floating Status Toast */}
      {toastMessage && (
        <div
          style={{
            position: 'absolute',
            top: 20,
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'rgba(20, 18, 16, 0.9)',
            border: '1px solid var(--border-highlight)',
            borderRadius: 20,
            padding: '8px 16px',
            color: 'var(--accent-gold)',
            fontSize: 13,
            fontWeight: 600,
            zIndex: 60,
            boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {toastMessage}
        </div>
      )}

      {/* Bottom Floating Navigation Toolbar */}
      <footer
        className={`reading-controls controls-footer ${controlsVisible && !isFocusMode ? '' : 'controls-hidden'}`}
        style={{
          display: isFocusMode ? 'none' : 'flex',
          padding: '8px 16px calc(var(--safe-bottom) + 12px) 16px',
          flexDirection: 'column',
          gap: 8,
          zIndex: 50,
        }}
      >
        {/* Secondary controls row: Zoom / EPUB Typography & Themes & Bookmarks */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
          {/* Zoom controls for PDF */}
          {book.format === 'pdf' ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                backgroundColor: 'rgba(26, 23, 20, 0.85)',
                backdropFilter: 'blur(8px)',
                borderRadius: 10,
                padding: '2px 4px',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <button
                className="icon-btn"
                onClick={handleZoomOut}
                disabled={zoomMultiplier <= 0.7}
                aria-label="Zoom out"
                style={{ width: 36, height: 36 }}
              >
                <ZoomOut size={16} />
              </button>

              <button
                onClick={handleResetZoom}
                aria-label="Reset zoom"
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  fontSize: 12,
                  fontWeight: 600,
                  padding: '0 6px',
                  cursor: 'pointer',
                }}
              >
                {Math.round(zoomMultiplier * 100)}%
              </button>

              <button
                className="icon-btn"
                onClick={handleZoomIn}
                disabled={zoomMultiplier >= 2.5}
                aria-label="Zoom in"
                style={{ width: 36, height: 36 }}
              >
                <ZoomIn size={16} />
              </button>
            </div>
          ) : book.format === 'epub' ? (
            /* EPUB Controls: Font Size A- / A+, Line Width slider, Themes */
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                backgroundColor: 'rgba(26, 23, 20, 0.9)',
                backdropFilter: 'blur(8px)',
                borderRadius: 10,
                padding: '4px 8px',
                border: '1px solid var(--border-subtle)',
                flexWrap: 'wrap',
              }}
            >
              {/* Font Size A- / A+ */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <button
                  className="icon-btn"
                  onClick={() => onUpdateSettings?.({ fontSize: Math.max(12, (settings.fontSize || 18) - 1) })}
                  disabled={(settings.fontSize || 18) <= 12}
                  aria-label="Decrease font size"
                  title="Smaller text (A-)"
                  style={{ width: 30, height: 30, fontSize: 13, fontWeight: 700 }}
                >
                  A-
                </button>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', minWidth: 26, textAlign: 'center' }}>
                  {settings.fontSize || 18}
                </span>
                <button
                  className="icon-btn"
                  onClick={() => onUpdateSettings?.({ fontSize: Math.min(36, (settings.fontSize || 18) + 1) })}
                  disabled={(settings.fontSize || 18) >= 36}
                  aria-label="Increase font size"
                  title="Larger text (A+)"
                  style={{ width: 30, height: 30, fontSize: 14, fontWeight: 700 }}
                >
                  A+
                </button>
              </div>

              <div style={{ width: 1, height: 16, backgroundColor: 'var(--border-subtle)' }} />

              {/* Line Width Slider */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }} title="Line Width">
                  Width
                </span>
                <input
                  type="range"
                  min="460"
                  max="1100"
                  step="20"
                  value={settings.lineWidth || 680}
                  onChange={(e) => onUpdateSettings?.({ lineWidth: Number(e.target.value) })}
                  title={`Line width: ${settings.lineWidth || 680}px`}
                  aria-label="Line width"
                  style={{ width: 68, height: 16, accentColor: 'var(--accent-gold)', cursor: 'pointer' }}
                />
              </div>

              <div style={{ width: 1, height: 16, backgroundColor: 'var(--border-subtle)' }} />

              {/* Themes: Light, Sepia, Dark */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button
                  onClick={() => onUpdateSettings?.({ theme: 'light' })}
                  title="Light Theme"
                  aria-label="Light Theme"
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    backgroundColor: '#FAF8F5',
                    border: settings.theme === 'light' ? '2px solid var(--accent-gold)' : '1px solid #CCC',
                    cursor: 'pointer',
                  }}
                />
                <button
                  onClick={() => onUpdateSettings?.({ theme: 'sepia' })}
                  title="Sepia Theme"
                  aria-label="Sepia Theme"
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    backgroundColor: '#F4ECD8',
                    border: settings.theme === 'sepia' ? '2px solid var(--accent-gold)' : '1px solid #CCC',
                    cursor: 'pointer',
                  }}
                />
                <button
                  onClick={() => onUpdateSettings?.({ theme: 'dark' })}
                  title="Dark Theme"
                  aria-label="Dark Theme"
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    backgroundColor: '#141210',
                    border: settings.theme === 'dark' ? '2px solid var(--accent-gold)' : '1px solid #555',
                    cursor: 'pointer',
                  }}
                />
              </div>
            </div>
          ) : (
            <div />
          )}

          {/* Action buttons: Focus Mode, Finish Chapter, Marks & Bookmarks */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* Focus Mode button */}
            <button
              className="secondary-btn"
              onClick={() => {
                setIsFocusMode(true);
                showToast('✦ Focus Mode (Press F or Esc to exit)');
              }}
              title="Toggle Focus Mode (Press F)"
              style={{
                height: 36,
                padding: '0 10px',
                fontSize: 12,
                borderRadius: 10,
                backgroundColor: 'rgba(26, 23, 20, 0.85)',
                backdropFilter: 'blur(8px)',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <Maximize2 size={14} color="var(--accent-gold)" />
              <span>Focus (F)</span>
            </button>

            {book.format === 'pdf' && (
              <button
                className="secondary-btn"
                onClick={handleFinishChapter}
                title="Finish Chapter"
                style={{
                  height: 36,
                  padding: '0 12px',
                  fontSize: 12,
                  borderRadius: 10,
                  backgroundColor: 'rgba(212, 175, 85, 0.15)',
                  border: '1px solid rgba(212, 175, 85, 0.35)',
                  color: 'var(--accent-gold)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Target size={14} color="var(--accent-gold)" />
                <span>Finish Chapter</span>
              </button>
            )}

            {onOpenMarks && (
              <button
                className="secondary-btn"
                onClick={onOpenMarks}
                style={{
                  height: 36,
                  padding: '0 12px',
                  fontSize: 12,
                  borderRadius: 10,
                  backgroundColor: 'rgba(26, 23, 20, 0.85)',
                  backdropFilter: 'blur(8px)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Highlighter size={14} color="var(--accent-gold)" />
                <span>Marks ({marks.length})</span>
              </button>
            )}

            <button
              className="secondary-btn"
              onClick={handleAddBookmark}
              style={{
                height: 36,
                padding: '0 12px',
                fontSize: 12,
                borderRadius: 10,
                backgroundColor: 'rgba(26, 23, 20, 0.85)',
                backdropFilter: 'blur(8px)',
              }}
            >
              <BookmarkIcon size={14} color="var(--accent-gold)" />
              <span>Bookmark Page</span>
            </button>
          </div>
        </div>

        {/* Primary Navigation Row: Prev | Page X/Y | Next */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'rgba(26, 23, 20, 0.92)',
            backdropFilter: 'blur(10px)',
            borderRadius: 14,
            border: '1px solid var(--border-highlight)',
            padding: '6px 8px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
          }}
        >
          {/* Previous Page Button */}
          <button
            className="icon-btn"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage <= 1}
            aria-label="Previous Page"
            style={{
              width: 48,
              height: 48,
              opacity: currentPage <= 1 ? 0.3 : 1,
              cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
            }}
          >
            <ChevronLeft size={28} />
          </button>

          {/* Jump to Page Trigger */}
          <button
            onClick={() => setIsJumpModalOpen(true)}
            aria-label="Jump to page"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '4px 12px',
              borderRadius: 8,
            }}
          >
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
              Page {currentPage} of {totalPages}
            </span>
            <span style={{ fontSize: 11, color: 'var(--accent-gold)' }}>
              {Math.round(totalPages > 0 ? (currentPage / totalPages) * 100 : 0)}% • Tap to Jump
            </span>
          </button>

          {/* Next Page Button */}
          <button
            className="icon-btn"
            onClick={handleNextPageClick}
            disabled={currentPage >= totalPages}
            aria-label="Next Page"
            style={{
              width: 48,
              height: 48,
              opacity: currentPage >= totalPages ? 0.3 : 1,
              cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
            }}
          >
            <ChevronRight size={28} />
          </button>
        </div>
      </footer>

      {/* Bookmarks Drawer */}
      {isBookmarksOpen && (
        <BookmarksDrawer
          bookmarks={bookmarks}
          currentPage={currentPage}
          onSelectBookmark={handleSelectBookmark}
          onAddBookmark={handleAddBookmark}
          onDeleteBookmark={handleDeleteBookmark}
          onClose={onCloseBookmarks}
        />
      )}

      {/* Marks & Notes Drawer */}
      {isMarksOpen && onCloseMarks && (
        <MarksDrawer
          book={book}
          marks={marks}
          onSelectMark={handleSelectMark}
          onDeleteMark={handleDeleteMark}
          onClose={onCloseMarks}
        />
      )}

      {/* Jump to Page Modal */}
      {isJumpModalOpen && (
        <JumpToPageModal
          currentPage={currentPage}
          totalPages={totalPages}
          onJump={(pageNum) => {
            handlePageChange(pageNum);
            setIsJumpModalOpen(false);
          }}
          onClose={() => setIsJumpModalOpen(false)}
        />
      )}

      {/* Chapter Action Step Dialog */}
      {pendingAction && (
        <ChapterActionDialog
          bookTitle={book.title}
          locationLabel={pendingAction.locationLabel}
          onSave={handleSaveAction}
          onSkip={handleSkipAction}
        />
      )}

      {/* Dictionary Popup on double-click */}
      {dictionaryWord && (
        <DictionaryPopup
          word={dictionaryWord}
          bookTitle={book.title}
          onClose={() => setDictionaryWord(null)}
          onWordSaved={(savedWord) => showToast(`✦ Saved "${savedWord}" to Vocabulary`)}
        />
      )}

      {/* Feature 12: Focus Mode Thin Progress Line at bottom */}
      {isFocusMode && (
        <div
          className="focus-progress-line"
          title={`Page ${currentPage} of ${totalPages} (${Math.round(totalPages > 0 ? (currentPage / totalPages) * 100 : 0)}%) • Press F to exit Focus Mode`}
          onClick={() => {
            setIsFocusMode(false);
            showToast('✦ Exited Focus Mode');
          }}
          style={{ cursor: 'pointer', pointerEvents: 'auto' }}
        >
          <div
            className="focus-progress-fill"
            style={{
              width: `${Math.min(100, Math.max(0, totalPages > 0 ? (currentPage / totalPages) * 100 : 0))}%`,
            }}
          />
        </div>
      )}
    </div>
  );
};
