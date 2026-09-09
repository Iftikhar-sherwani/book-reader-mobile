import React from 'react';
import type { Bookmark } from '../types';
import { Bookmark as BookmarkIcon, Trash2, X, Plus, Clock } from 'lucide-react';

interface BookmarksDrawerProps {
  bookmarks: Bookmark[];
  currentPage: number;
  onSelectBookmark: (bm: Bookmark) => void;
  onAddBookmark: () => void;
  onDeleteBookmark: (id: string) => void;
  onClose: () => void;
}

export const BookmarksDrawer: React.FC<BookmarksDrawerProps> = ({
  bookmarks,
  currentPage,
  onSelectBookmark,
  onAddBookmark,
  onDeleteBookmark,
  onClose,
}) => {
  const isCurrentPageBookmarked = bookmarks.some((b) => b.pageIndex === currentPage);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="bottom-sheet" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BookmarkIcon size={20} color="var(--accent-gold)" />
            <h3 style={{ fontSize: 18, color: 'var(--text-secondary)', fontFamily: 'var(--font-display)' }}>
              Bookmarks
            </h3>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close bookmarks">
            <X size={20} />
          </button>
        </div>

        {/* Action button to bookmark current page */}
        <div style={{ marginBottom: 20 }}>
          <button
            className="primary-btn"
            onClick={onAddBookmark}
            style={{ width: '100%' }}
          >
            <Plus size={18} />
            <span>
              {isCurrentPageBookmarked
                ? `Add Another Bookmark (Page ${currentPage})`
                : `Bookmark Current Page (${currentPage})`}
            </span>
          </button>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, textAlign: 'center' }}>
            Manual bookmarks stay fixed and separate from auto-saved progress.
          </p>
        </div>

        {/* Bookmarks List */}
        {bookmarks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px 20px', color: 'var(--text-muted)' }}>
            <p>No saved bookmarks for this book yet.</p>
            <p style={{ fontSize: 13, marginTop: 6 }}>Tap the button above to bookmark page {currentPage}.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {bookmarks.map((bm) => (
              <div
                key={bm.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 14px',
                  borderRadius: 12,
                  backgroundColor: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                  cursor: 'pointer',
                }}
                onClick={() => onSelectBookmark(bm)}
              >
                <div style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: 'var(--accent-gold)',
                        backgroundColor: 'var(--bg-card)',
                        padding: '2px 8px',
                        borderRadius: 6,
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      Page {bm.pageIndex}
                    </span>
                    {bm.createdAt && (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <Clock size={11} />
                        {new Date(bm.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                  </div>
                  {bm.title && (
                    <p
                      style={{
                        fontSize: 13,
                        color: 'var(--text-primary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {bm.title}
                    </p>
                  )}
                </div>

                <button
                  className="icon-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteBookmark(bm.id);
                  }}
                  aria-label={`Delete bookmark for page ${bm.pageIndex}`}
                  style={{ color: 'var(--danger)', flexShrink: 0 }}
                >
                  <Trash2 size={17} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
