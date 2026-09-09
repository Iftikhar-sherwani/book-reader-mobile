import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Book, ReadingProgress, Bookmark, ReaderSettings } from '../types';
import { getBookBlob, getProgress, saveProgress, getBookmarks, saveBookmark, deleteBookmark, updateBookMetadata } from '../services/db';
import { PdfReader } from './PdfReader';
import { EpubReader } from './EpubReader';
import { TxtReader } from './TxtReader';
import { BookmarksDrawer } from './BookmarksDrawer';
import { JumpToPageModal } from './JumpToPageModal';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Bookmark as BookmarkIcon,
  AlertTriangle,
  Loader2,
  ArrowLeft,
} from 'lucide-react';

interface ReaderViewProps {
  book: Book;
  settings: ReaderSettings;
  onBackToLibrary: () => void;
  isBookmarksOpen: boolean;
  onCloseBookmarks: () => void;
}

export const ReaderView: React.FC<ReaderViewProps> = ({
  book,
  settings,
  onBackToLibrary,
  isBookmarksOpen,
  onCloseBookmarks,
}) => {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Navigation state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(book.pageCount || 1);
  const [scrollOffset, setScrollOffset] = useState<number>(0);
  const [zoomMultiplier, setZoomMultiplier] = useState<number>(1.0);

  // UI state
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isJumpModalOpen, setIsJumpModalOpen] = useState(false);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

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

  // 1. Load book blob, initial progress & bookmarks
  useEffect(() => {
    let mounted = true;

    const loadData = async () => {
      try {
        setLoading(true);
        const [bookBlob, savedProgress, savedBookmarks] = await Promise.all([
          getBookBlob(book.id),
          getProgress(book.id),
          getBookmarks(book.id),
        ]);

        if (!mounted) return;

        if (!bookBlob) {
          setError('Book file not found in local storage.');
          setLoading(false);
          return;
        }

        setBlob(bookBlob);
        setBookmarks(savedBookmarks);

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
      setCurrentPage(chapterIndex);
      setScrollOffset(scroll);
      triggerSaveProgress(chapterIndex, scroll, totalPagesRef.current);
    },
    [triggerSaveProgress]
  );

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
          onPageCountLoaded={handlePageCountLoaded}
          onChapterChange={handleEpubChapterChange}
          onToggleControls={() => setControlsVisible(!controlsVisible)}
          onError={(err) => setError(err)}
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
        className={`reading-controls controls-footer ${controlsVisible ? '' : 'controls-hidden'}`}
        style={{
          padding: '8px 16px calc(var(--safe-bottom) + 12px) 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          zIndex: 50,
        }}
      >
        {/* Secondary controls row: Zoom & Bookmark */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
          ) : (
            <div />
          )}

          {/* Quick Bookmark Button */}
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
            onClick={() => handlePageChange(currentPage + 1)}
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
    </div>
  );
};
