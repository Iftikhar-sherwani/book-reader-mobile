import React, { useState, useEffect, useRef } from 'react';
import type { Book, SearchResult } from '../types';
import { Search, X, Loader2, BookOpen } from 'lucide-react';
import { searchPages } from '../services/db';

interface SearchModalProps {
  currentBook: Book | null;
  onSelectResult: (result: SearchResult) => void;
  onClose: () => void;
}

export const SearchModal: React.FC<SearchModalProps> = ({
  currentBook,
  onSelectResult,
  onClose,
}) => {
  const [mode, setMode] = useState<'book' | 'all'>(currentBook ? 'book' : 'all');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounced search
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    let active = true;
    setIsSearching(true);

    const timer = setTimeout(async () => {
      try {
        const bookIdFilter = mode === 'book' && currentBook ? currentBook.id : undefined;
        const res = await searchPages(q, bookIdFilter);
        if (active) {
          setResults(res);
          setIsSearching(false);
        }
      } catch (err) {
        if (active) setIsSearching(false);
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, mode, currentBook]);

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 95 }}>
      <div
        className="modal-box"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 580,
          width: '95%',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 16,
        }}
      >
        {/* Header & Modes */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {currentBook && (
              <button
                type="button"
                onClick={() => setMode('book')}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: mode === 'book' ? '1px solid var(--accent-gold)' : '1px solid var(--border-subtle)',
                  backgroundColor: mode === 'book' ? 'rgba(212, 175, 85, 0.2)' : 'transparent',
                  color: mode === 'book' ? 'var(--accent-gold)' : 'var(--text-muted)',
                }}
              >
                THIS BOOK
              </button>
            )}
            <button
              type="button"
              onClick={() => setMode('all')}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                border: mode === 'all' ? '1px solid var(--accent-gold)' : '1px solid var(--border-subtle)',
                backgroundColor: mode === 'all' ? 'rgba(212, 175, 85, 0.2)' : 'transparent',
                color: mode === 'all' ? 'var(--accent-gold)' : 'var(--text-muted)',
              }}
            >
              ALL BOOKS
            </button>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close search">
            <X size={20} />
          </button>
        </div>

        {/* Search input */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', marginBottom: 14 }}>
          <Search size={18} color="var(--text-muted)" style={{ position: 'absolute', left: 12, pointerEvents: 'none' }} />
          <input
            ref={inputRef}
            type="text"
            placeholder={mode === 'book' ? `Search in ${currentBook?.title || 'book'}...` : 'Search across all books...'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              width: '100%',
              height: 44,
              paddingLeft: 38,
              paddingRight: query ? 36 : 12,
              borderRadius: 10,
              backgroundColor: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
              fontSize: 15,
            }}
          />
          {query && (
            <button
              className="icon-btn"
              onClick={() => setQuery('')}
              style={{ position: 'absolute', right: 8, padding: 4 }}
              aria-label="Clear search"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Results status or Loader */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, minHeight: 20 }}>
          {isSearching ? (
            <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Loader2 size={12} className="spin-slow" /> Searching...
            </span>
          ) : query.trim().length >= 2 ? (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Found {results.length} result{results.length !== 1 ? 's' : ''}
            </span>
          ) : null}
        </div>

        {/* Results List */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {query.trim().length < 2 ? (
            <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--text-muted)' }}>
              Type at least 2 characters to search full text.
            </div>
          ) : results.length === 0 && !isSearching ? (
            <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--text-muted)' }}>
              No matches found for "{query}".
            </div>
          ) : (
            results.map((r, i) => {
              const locLabel = r.format === 'epub' ? `Chapter ${r.loc}` : `Page ${r.loc}`;
              return (
                <div
                  key={`${r.bookId}_${r.loc}_${i}`}
                  onClick={() => onSelectResult(r)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    backgroundColor: 'var(--bg-elevated)',
                    border: '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <BookOpen size={13} color="var(--accent-gold)" />
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: 'var(--text-secondary)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          maxWidth: 220,
                        }}
                      >
                        {r.bookTitle}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: 'var(--accent-gold)',
                        backgroundColor: 'var(--bg-card)',
                        padding: '1px 6px',
                        borderRadius: 4,
                      }}
                    >
                      {locLabel}
                    </span>
                  </div>

                  <p
                    style={{
                      fontSize: 13,
                      lineHeight: 1.45,
                      color: 'var(--text-primary)',
                      margin: 0,
                    }}
                    dangerouslySetInnerHTML={{ __html: r.snippet }}
                  />
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
