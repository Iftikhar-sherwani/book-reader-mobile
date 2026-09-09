import React, { useState, useRef } from 'react';
import type { Book, ReadingProgress } from '../types';
import {
  Plus,
  Search,
  BookOpen,
  Trash2,
  Clock,
  FileText,
  AlertCircle,
  Play,
  Bookmark as BookmarkIcon,
} from 'lucide-react';
import { InstallPrompt } from './InstallPrompt';

interface LibraryViewProps {
  books: Book[];
  progressMap: Map<string, ReadingProgress>;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSelectBook: (book: Book) => void;
  onImportFile: (file: File) => void;
  onDeleteBook: (book: Book) => void;
  isImporting: boolean;
  importError?: string | null;
  deferredPrompt: any;
  isStandalone: boolean;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  books,
  progressMap,
  searchQuery,
  onSearchChange,
  onSelectBook,
  onImportFile,
  onDeleteBook,
  isImporting,
  importError,
  deferredPrompt,
  isStandalone,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [bookToDelete, setBookToDelete] = useState<Book | null>(null);

  // Filter books by search query
  const filteredBooks = books.filter(
    (b) =>
      b.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.author.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // The most recently opened book
  const recentBook = books.length > 0 && books[0].lastOpenedAt ? books[0] : null;
  const recentProgress = recentBook ? progressMap.get(recentBook.id) : null;

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImportFile(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        padding: '16px 16px calc(30px + var(--safe-bottom)) 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
      }}
    >
      {/* Hidden file picker */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.epub,.txt,application/pdf,application/epub+zip,text/plain"
        style={{ display: 'none' }}
        onChange={handleFileInputChange}
      />

      {/* Top Toolbar: Search & Add Book & PWA Install */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Search Bar */}
          <div
            style={{
              flex: 1,
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Search
              size={18}
              color="var(--text-muted)"
              style={{ position: 'absolute', left: 12, pointerEvents: 'none' }}
            />
            <input
              type="text"
              placeholder="Search library..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              style={{
                width: '100%',
                height: 44,
                paddingLeft: 38,
                paddingRight: 12,
                borderRadius: 12,
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-subtle)',
                outline: 'none',
                fontSize: 14,
              }}
            />
          </div>

          {/* Add Book Button */}
          <button
            className="primary-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            style={{ height: 44, padding: '0 16px', flexShrink: 0 }}
          >
            <Plus size={18} />
            <span style={{ display: 'inline' }}>Add Book</span>
          </button>
        </div>

        {/* Install Prompt Button if available */}
        <InstallPrompt
          deferredPrompt={deferredPrompt}
          isStandalone={isStandalone}
          onInstalled={() => {}}
        />

        {/* Import feedback / error */}
        {isImporting && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 10,
              backgroundColor: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--accent-gold)',
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <BookOpen size={16} />
            <span>Processing and storing book locally...</span>
          </div>
        )}

        {importError && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 10,
              backgroundColor: 'rgba(224, 108, 117, 0.12)',
              border: '1px solid rgba(224, 108, 117, 0.3)',
              color: 'var(--danger)',
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <AlertCircle size={16} />
            <span>{importError}</span>
          </div>
        )}
      </div>

      {/* Prominent "Continue Reading" Action */}
      {recentBook && !searchQuery && (
        <section
          style={{
            padding: 16,
            borderRadius: 16,
            background: 'linear-gradient(135deg, #24201B, #1B1814)',
            border: '1px solid var(--border-highlight)',
            boxShadow: '0 6px 20px rgba(0, 0, 0, 0.35)',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--accent-gold)',
                letterSpacing: '1px',
                textTransform: 'uppercase',
              }}
            >
              ✦ Continue Reading
            </span>
            <span className="badge badge-gold">
              {recentBook.format.toUpperCase()}
            </span>
          </div>

          <div>
            <h3
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-serif)',
                marginBottom: 4,
              }}
            >
              {recentBook.title}
            </h3>
            {recentBook.author && (
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>by {recentBook.author}</p>
            )}
          </div>

          {/* Progress bar */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
              <span>
                {recentProgress && recentProgress.pageIndex > 0
                  ? `Page ${recentProgress.pageIndex}${recentBook.pageCount > 0 ? ` of ${recentBook.pageCount}` : ''}`
                  : 'Ready to start'}
              </span>
              <span>
                {recentProgress ? `${Math.round(recentProgress.percentage)}%` : '0%'}
              </span>
            </div>
            <div
              style={{
                height: 6,
                borderRadius: 3,
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${recentProgress ? Math.min(100, Math.max(2, recentProgress.percentage)) : 0}%`,
                  backgroundColor: 'var(--accent-gold)',
                  borderRadius: 3,
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          </div>

          <button
            className="primary-btn"
            onClick={() => onSelectBook(recentBook)}
            style={{ width: '100%', marginTop: 4 }}
          >
            <Play size={16} fill="currentColor" />
            <span>Resume Reading</span>
          </button>
        </section>
      )}

      {/* Library Books List */}
      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)' }}>
            My Library ({filteredBooks.length})
          </h2>
        </div>

        {books.length === 0 ? (
          /* Empty state */
          <div
            style={{
              padding: '48px 24px',
              textAlign: 'center',
              backgroundColor: 'var(--bg-surface)',
              borderRadius: 16,
              border: '1px dashed var(--border-subtle)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 14,
            }}
          >
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                backgroundColor: 'var(--bg-elevated)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-gold)',
              }}
            >
              <BookOpen size={32} />
            </div>
            <div>
              <h3 style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
                Your Library is Empty
              </h3>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 300, margin: '0 auto', lineHeight: 1.5 }}>
                Tap the button below to import PDF, EPUB, or TXT books from your phone. Books stay stored safely on your device for offline reading.
              </p>
            </div>
            <button
              className="primary-btn"
              onClick={() => fileInputRef.current?.click()}
              style={{ marginTop: 8 }}
            >
              <Plus size={18} />
              <span>Import Your First Book</span>
            </button>
          </div>
        ) : filteredBooks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
            No books matched &ldquo;{searchQuery}&rdquo;.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filteredBooks.map((book) => {
              const prog = progressMap.get(book.id);
              const percent = prog ? Math.round(prog.percentage) : 0;

              return (
                <div
                  key={book.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 14px',
                    borderRadius: 14,
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                    transition: 'border-color 0.2s ease',
                  }}
                  onClick={() => onSelectBook(book)}
                >
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        width: 44,
                        height: 54,
                        borderRadius: 6,
                        backgroundColor: 'var(--bg-elevated)',
                        border: '1px solid var(--border-subtle)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <FileText size={20} color="var(--accent-gold)" />
                      <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', marginTop: 2 }}>
                        {book.format.toUpperCase()}
                      </span>
                    </div>

                    <div style={{ minWidth: 0, flex: 1, paddingRight: 8 }}>
                      <h3
                        style={{
                          fontSize: 15,
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          marginBottom: 2,
                        }}
                      >
                        {book.title}
                      </h3>
                      {book.author && (
                        <p
                          style={{
                            fontSize: 12,
                            color: 'var(--text-muted)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            marginBottom: 6,
                          }}
                        >
                          {book.author}
                        </p>
                      )}

                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: 'var(--text-secondary)' }}>
                        <span>
                          {prog && prog.pageIndex > 0
                            ? `Page ${prog.pageIndex}${book.pageCount > 0 ? ` of ${book.pageCount}` : ''}`
                            : 'Unread'}
                        </span>
                        <span>•</span>
                        <span>{percent}%</span>
                        {book.lastOpenedAt && (
                          <>
                            <span>•</span>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                              <Clock size={11} />
                              {new Date(book.lastOpenedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button
                      className="icon-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setBookToDelete(book);
                      }}
                      aria-label={`Delete ${book.title}`}
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Delete Confirmation Modal */}
      {bookToDelete && (
        <div className="modal-overlay" onClick={() => setBookToDelete(null)}>
          <div className="modal-center" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <AlertCircle size={22} color="var(--danger)" />
              <h3 style={{ fontSize: 18, color: 'var(--text-primary)' }}>Delete Book?</h3>
            </div>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.5 }}>
              Are you sure you want to remove &ldquo;<strong>{bookToDelete.title}</strong>&rdquo; from your device? This will also delete its bookmarks and reading progress.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="secondary-btn"
                onClick={() => setBookToDelete(null)}
                style={{ flex: 1 }}
              >
                Cancel
              </button>
              <button
                className="danger-btn"
                onClick={() => {
                  onDeleteBook(bookToDelete);
                  setBookToDelete(null);
                }}
                style={{ flex: 1 }}
              >
                <Trash2 size={16} />
                <span>Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
