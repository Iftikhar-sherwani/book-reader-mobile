import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Book, ReadingProgress, ChapterAction, VocabWord } from '../types';
import { getActions, setActionDone, deleteAction, getAllVocab, deleteVocabWord } from '../services/db';
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
  HelpCircle,
  X,
  Download,
  Brain,
  CheckSquare,
  Check,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { InstallPrompt } from './InstallPrompt';

function formatActionDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return isoString;
  }
}

interface LibraryViewProps {
  books: Book[];
  progressMap: Map<string, ReadingProgress>;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSelectBook: (book: Book) => void;
  onImportFile: (file: File) => void;
  onDeleteBook: (book: Book) => void;
  onExportAllMarks?: () => void;
  onOpenReview?: () => void;
  onOpenStats?: () => void;
  todayReadingSeconds?: number;
  dueReviewCount: number;
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
  onExportAllMarks,
  onOpenReview,
  onOpenStats,
  todayReadingSeconds = 0,
  dueReviewCount,
  isImporting,
  importError,
  deferredPrompt,
  isStandalone,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const allFilesInputRef = useRef<HTMLInputElement>(null);
  const [bookToDelete, setBookToDelete] = useState<Book | null>(null);
  const [showMemoryHelp, setShowMemoryHelp] = useState(false);

  // Tabs State (Books / Actions / Vocabulary)
  const [activeTab, setActiveTab] = useState<'books' | 'actions' | 'vocab'>('books');
  const [actions, setActions] = useState<ChapterAction[]>([]);
  const [actionFilter, setActionFilter] = useState<'all' | 'pending' | 'done'>('all');

  // Vocabulary Tab State
  const [vocabWords, setVocabWords] = useState<VocabWord[]>([]);

  const loadActions = useCallback(async () => {
    try {
      const items = await getActions();
      setActions(items);
    } catch (err) {
      console.warn('Failed to load actions:', err);
    }
  }, []);

  const loadVocab = useCallback(async () => {
    try {
      const items = await getAllVocab();
      setVocabWords(items);
    } catch (err) {
      console.warn('Failed to load vocabulary:', err);
    }
  }, []);

  useEffect(() => {
    loadActions();
    loadVocab();
  }, [loadActions, loadVocab, activeTab]);

  const handleToggleAction = async (action: ChapterAction) => {
    const newDone = action.done === 1 ? 0 : 1;
    try {
      await setActionDone(action.id, newDone);
      setActions((prev) =>
        prev.map((a) => (a.id === action.id ? { ...a, done: newDone } : a))
      );
    } catch (err) {
      console.warn('Failed to update action:', err);
    }
  };

  const handleDeleteAction = async (id: string) => {
    try {
      await deleteAction(id);
      setActions((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      console.warn('Failed to delete action:', err);
    }
  };

  const handleDeleteVocab = async (id: string) => {
    try {
      await deleteVocabWord(id);
      setVocabWords((prev) => prev.filter((v) => v.id !== id));
    } catch (err) {
      console.warn('Failed to delete vocabulary word:', err);
    }
  };

  const pendingActionsCount = actions.filter((a) => a.done === 0).length;

  const filteredActions = actions.filter((a) => {
    if (actionFilter === 'pending' && a.done === 1) return false;
    if (actionFilter === 'done' && a.done === 0) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const textMatch = a.text.toLowerCase().includes(q);
      const bookMatch = a.bookTitle?.toLowerCase().includes(q);
      const locMatch = a.loc.toLowerCase().includes(q);
      return textMatch || bookMatch || locMatch;
    }
    return true;
  });

  const filteredVocab = vocabWords.filter((v) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const wordMatch = v.word.toLowerCase().includes(q);
      const defMatch = v.definition.toLowerCase().includes(q);
      const bookMatch = v.book.toLowerCase().includes(q);
      return wordMatch || defMatch || bookMatch;
    }
    return true;
  });

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
    if (e.target) {
      e.target.value = '';
    }
  };

  const handleTriggerAddBook = async () => {
    // Try modern File System Access API if supported (uses less RAM than legacy Android intents)
    if (typeof window !== 'undefined' && 'showOpenFilePicker' in window) {
      try {
        const [handle] = await (window as any).showOpenFilePicker({
          types: [
            {
              description: 'Books (PDF, EPUB, TXT)',
              accept: {
                'application/pdf': ['.pdf'],
                'application/epub+zip': ['.epub'],
                'text/plain': ['.txt'],
              },
            },
          ],
          multiple: false,
        });
        if (handle) {
          const file = await handle.getFile();
          if (file) {
            onImportFile(file);
            return;
          }
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') return; // User cancelled
        // If not supported on mobile, fallback below
      }
    }

    // Standard file input with clean extension filter
    fileInputRef.current?.click();
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
      {/* Hidden file pickers: clean extension list to prevent Android media scanner memory spikes */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.epub,.txt"
        style={{ display: 'none' }}
        onChange={handleFileInputChange}
      />
      <input
        ref={allFilesInputRef}
        type="file"
        accept="*/*"
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
              placeholder={activeTab === 'books' ? "Search library..." : activeTab === 'actions' ? "Search action steps..." : "Search vocabulary..."}
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
            onClick={handleTriggerAddBook}
            disabled={isImporting}
            style={{ height: 44, padding: '0 16px', flexShrink: 0 }}
          >
            <Plus size={18} />
            <span style={{ display: 'inline' }}>Add Book</span>
          </button>

          {/* Export All Marks Button */}
          {onExportAllMarks && (
            <button
              className="secondary-btn"
              onClick={onExportAllMarks}
              title="Export all book marks to Markdown"
              aria-label="Export all marks"
              style={{
                height: 44,
                padding: '0 12px',
                borderRadius: 12,
                fontSize: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                backgroundColor: 'rgba(212, 175, 85, 0.12)',
                color: 'var(--accent-gold)',
                border: '1px solid rgba(212, 175, 85, 0.35)',
                flexShrink: 0,
              }}
            >
              <Download size={16} />
              <span style={{ display: 'inline' }}>Export Marks</span>
            </button>
          )}
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

      {/* Navigation Tabs: Books / Actions / Vocabulary */}
      <div
        style={{
          display: 'flex',
          backgroundColor: 'var(--bg-surface)',
          borderRadius: 14,
          padding: 4,
          border: '1px solid var(--border-subtle)',
          gap: 4,
        }}
      >
        <button
          onClick={() => setActiveTab('books')}
          style={{
            flex: 1,
            padding: '10px 10px',
            borderRadius: 10,
            border: 'none',
            backgroundColor: activeTab === 'books' ? 'var(--bg-elevated)' : 'transparent',
            color: activeTab === 'books' ? 'var(--accent-gold)' : 'var(--text-secondary)',
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            boxShadow: activeTab === 'books' ? '0 2px 8px rgba(0,0,0,0.3)' : 'none',
            transition: 'all 0.15s ease',
          }}
        >
          <BookOpen size={15} />
          <span>Books ({books.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('actions')}
          style={{
            flex: 1,
            padding: '10px 10px',
            borderRadius: 10,
            border: 'none',
            backgroundColor: activeTab === 'actions' ? 'var(--bg-elevated)' : 'transparent',
            color: activeTab === 'actions' ? 'var(--accent-gold)' : 'var(--text-secondary)',
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            boxShadow: activeTab === 'actions' ? '0 2px 8px rgba(0,0,0,0.3)' : 'none',
            transition: 'all 0.15s ease',
          }}
        >
          <CheckSquare size={15} />
          <span>Actions</span>
          {pendingActionsCount > 0 && (
            <span
              style={{
                padding: '1px 6px',
                borderRadius: 10,
                fontSize: 11,
                fontWeight: 700,
                backgroundColor: 'rgba(212, 175, 85, 0.2)',
                color: 'var(--accent-gold)',
                border: '1px solid rgba(212, 175, 85, 0.4)',
              }}
            >
              {pendingActionsCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('vocab')}
          style={{
            flex: 1,
            padding: '10px 10px',
            borderRadius: 10,
            border: 'none',
            backgroundColor: activeTab === 'vocab' ? 'var(--bg-elevated)' : 'transparent',
            color: activeTab === 'vocab' ? 'var(--accent-gold)' : 'var(--text-secondary)',
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            boxShadow: activeTab === 'vocab' ? '0 2px 8px rgba(0,0,0,0.3)' : 'none',
            transition: 'all 0.15s ease',
          }}
        >
          <Sparkles size={15} />
          <span>Vocab</span>
          {vocabWords.length > 0 && (
            <span
              style={{
                padding: '1px 6px',
                borderRadius: 10,
                fontSize: 11,
                fontWeight: 700,
                backgroundColor: 'rgba(212, 175, 85, 0.2)',
                color: 'var(--accent-gold)',
                border: '1px solid rgba(212, 175, 85, 0.4)',
              }}
            >
              {vocabWords.length}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'vocab' ? (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)', margin: 0 }}>
              Saved Vocabulary ({filteredVocab.length})
            </h2>
          </div>

          {filteredVocab.length === 0 ? (
            /* Empty State */
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
                gap: 12,
              }}
            >
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 16,
                  backgroundColor: 'rgba(212, 175, 85, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--accent-gold)',
                }}
              >
                <Sparkles size={26} />
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                {searchQuery.trim() ? 'No matching vocabulary' : 'No saved words yet'}
              </h3>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 320, lineHeight: 1.5, margin: 0 }}>
                {searchQuery.trim()
                  ? `No vocabulary matching "${searchQuery}"`
                  : 'Double-click any word while reading to view its dictionary definition and tap "Save word" to build your personal lexicon.'}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filteredVocab.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    padding: '16px 18px',
                    borderRadius: 14,
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-highlight)',
                    boxShadow: '0 4px 14px rgba(0, 0, 0, 0.25)',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {/* Top row: Word & Delete Button */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span
                      style={{
                        fontSize: 18,
                        fontWeight: 700,
                        color: 'var(--accent-gold)',
                        fontFamily: 'var(--font-serif)',
                        letterSpacing: '0.3px',
                      }}
                    >
                      {item.word}
                    </span>

                    <button
                      className="icon-btn"
                      onClick={() => handleDeleteVocab(item.id)}
                      aria-label={`Delete ${item.word}`}
                      title="Delete word"
                      style={{ width: 32, height: 32, color: 'var(--text-muted)' }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  {/* Definition */}
                  <p
                    style={{
                      margin: 0,
                      fontSize: 14,
                      lineHeight: 1.6,
                      color: 'var(--text-primary)',
                      wordBreak: 'break-word',
                    }}
                  >
                    {item.definition}
                  </p>

                  {/* Metadata: Book & Date */}
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 12,
                      color: 'var(--text-muted)',
                      paddingTop: 8,
                      borderTop: '1px solid var(--border-subtle)',
                    }}
                  >
                    {item.book && (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          color: 'var(--text-secondary)',
                          fontWeight: 600,
                        }}
                      >
                        <BookOpen size={12} color="var(--accent-gold)" />
                        <span
                          style={{
                            maxWidth: 200,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {item.book}
                        </span>
                      </span>
                    )}

                    {item.date && (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                        {formatActionDate(item.date)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : activeTab === 'actions' ? (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Action Filter Pills */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {(['all', 'pending', 'done'] as const).map((filter) => {
              const count =
                filter === 'all'
                  ? actions.length
                  : filter === 'pending'
                  ? pendingActionsCount
                  : actions.length - pendingActionsCount;
              const isActive = actionFilter === filter;
              return (
                <button
                  key={filter}
                  onClick={() => setActionFilter(filter)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 20,
                    fontSize: 13,
                    fontWeight: 600,
                    border: isActive
                      ? '1px solid var(--border-highlight)'
                      : '1px solid var(--border-subtle)',
                    backgroundColor: isActive ? 'var(--bg-elevated)' : 'transparent',
                    color: isActive ? 'var(--accent-gold)' : 'var(--text-muted)',
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {filter} ({count})
                </button>
              );
            })}
          </div>

          {filteredActions.length === 0 ? (
            /* Empty State */
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
                gap: 12,
              }}
            >
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 16,
                  backgroundColor: 'rgba(212, 175, 85, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--accent-gold)',
                }}
              >
                <CheckSquare size={26} />
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                {actionFilter === 'done'
                  ? 'No completed actions yet'
                  : actionFilter === 'pending'
                  ? 'All caught up!'
                  : 'No chapter action steps yet'}
              </h3>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 320, lineHeight: 1.5, margin: 0 }}>
                When you finish a chapter in an EPUB or tap &ldquo;Finish Chapter&rdquo; in a PDF, you&apos;ll be prompted to record an action step here.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filteredActions.map((action) => (
                <div
                  key={action.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 14,
                    padding: '14px 16px',
                    borderRadius: 14,
                    backgroundColor: 'var(--bg-surface)',
                    border: action.done
                      ? '1px solid var(--border-subtle)'
                      : '1px solid var(--border-highlight)',
                    opacity: action.done ? 0.65 : 1,
                    transition: 'all 0.2s ease',
                  }}
                >
                  {/* Checkbox button */}
                  <button
                    onClick={() => handleToggleAction(action)}
                    aria-label={action.done ? 'Mark as incomplete' : 'Mark as done'}
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 8,
                      border: action.done
                        ? '1px solid var(--accent-gold)'
                        : '2px solid var(--border-subtle)',
                      backgroundColor: action.done ? 'var(--accent-gold)' : 'transparent',
                      color: action.done ? '#141210' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      flexShrink: 0,
                      marginTop: 2,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {action.done === 1 && <Check size={16} strokeWidth={3} />}
                  </button>

                  {/* Action content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        margin: 0,
                        fontSize: 15,
                        fontWeight: 500,
                        lineHeight: 1.5,
                        color: action.done ? 'var(--text-muted)' : 'var(--text-primary)',
                        textDecoration: action.done ? 'line-through' : 'none',
                        wordBreak: 'break-word',
                      }}
                    >
                      {action.text}
                    </p>

                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: 8,
                        marginTop: 8,
                        fontSize: 12,
                        color: 'var(--text-muted)',
                      }}
                    >
                      {action.bookTitle && (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            color: 'var(--text-secondary)',
                            fontWeight: 600,
                          }}
                        >
                          <BookOpen size={12} color="var(--accent-gold)" />
                          <span
                            style={{
                              maxWidth: 180,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {action.bookTitle}
                          </span>
                        </span>
                      )}

                      {action.loc && (
                        <span className="badge badge-gold" style={{ fontSize: 10, padding: '2px 6px' }}>
                          {action.loc}
                        </span>
                      )}

                      {action.created && (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {formatActionDate(action.created)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Delete button */}
                  <button
                    className="icon-btn"
                    onClick={() => handleDeleteAction(action.id)}
                    aria-label="Delete action"
                    title="Delete action"
                    style={{ width: 32, height: 32, flexShrink: 0 }}
                  >
                    <Trash2 size={16} color="var(--text-muted)" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : (
        <>
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

      {/* Daily Review Button */}
      {onOpenReview && !searchQuery && (
        <button
          onClick={onOpenReview}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            width: '100%',
            padding: '14px 16px',
            borderRadius: 14,
            background: dueReviewCount > 0
              ? 'linear-gradient(135deg, rgba(97, 175, 239, 0.12), rgba(152, 195, 121, 0.08))'
              : 'var(--bg-surface)',
            border: dueReviewCount > 0
              ? '1px solid rgba(97, 175, 239, 0.3)'
              : '1px solid var(--border-subtle)',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            textAlign: 'left',
          }}
        >
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              background: dueReviewCount > 0
                ? 'linear-gradient(135deg, rgba(97, 175, 239, 0.2), rgba(152, 195, 121, 0.15))'
                : 'var(--bg-elevated)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Brain size={22} color={dueReviewCount > 0 ? 'var(--info)' : 'var(--text-muted)'} />
          </div>
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: dueReviewCount > 0 ? 'var(--text-primary)' : 'var(--text-muted)',
              }}
            >
              Daily Review
            </div>
            <div
              style={{
                fontSize: 12,
                color: dueReviewCount > 0 ? 'var(--info)' : 'var(--text-muted)',
                marginTop: 1,
              }}
            >
              {dueReviewCount > 0
                ? `${dueReviewCount} card${dueReviewCount > 1 ? 's' : ''} due today`
                : 'All caught up!'}
            </div>
          </div>
          {dueReviewCount > 0 && (
            <div
              style={{
                padding: '4px 10px',
                borderRadius: 20,
                backgroundColor: 'rgba(97, 175, 239, 0.15)',
                border: '1px solid rgba(97, 175, 239, 0.3)',
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--info)',
              }}
            >
              {dueReviewCount}
            </div>
          )}
        </button>
      )}

      {/* Reading Stats & Daily Goal Button */}
      {onOpenStats && !searchQuery && (
        <button
          onClick={onOpenStats}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            width: '100%',
            padding: '14px 16px',
            borderRadius: 14,
            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.12), rgba(168, 85, 247, 0.08))',
            border: '1px solid rgba(99, 102, 241, 0.25)',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            textAlign: 'left',
          }}
        >
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.25), rgba(168, 85, 247, 0.2))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <TrendingUp size={22} color="#818cf8" />
          </div>
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: 'var(--text-primary)',
              }}
            >
              Reading Stats & Goals
            </div>
            <div
              style={{
                fontSize: 12,
                color: 'var(--text-secondary)',
                marginTop: 1,
              }}
            >
              {todayReadingSeconds > 0
                ? `${Math.round(todayReadingSeconds / 60)} min read today • 7-day pace & streak`
                : 'Track daily reading time, streaks & book pace'}
            </div>
          </div>
          <div
            style={{
              padding: '4px 10px',
              borderRadius: 20,
              backgroundColor: 'rgba(99, 102, 241, 0.15)',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              fontSize: 12,
              fontWeight: 700,
              color: '#818cf8',
            }}
          >
            View
          </div>
        </button>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 280, marginTop: 6 }}>
              <button
                className="primary-btn"
                onClick={handleTriggerAddBook}
                style={{ width: '100%' }}
              >
                <Plus size={18} />
                <span>Import Book (.pdf, .epub, .txt)</span>
              </button>

              <button
                className="secondary-btn"
                onClick={() => allFilesInputRef.current?.click()}
                style={{ width: '100%', fontSize: 13 }}
              >
                <FileText size={16} />
                <span>Select from All Files (*/*)</span>
              </button>

              <button
                onClick={() => setShowMemoryHelp(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  cursor: 'pointer',
                  padding: '6px 0',
                }}
              >
                <HelpCircle size={13} />
                <span>Low memory alert on your phone? Tap here</span>
              </button>
            </div>
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
        </>
      )}

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

      {/* Android Low Memory Troubleshooting Sheet */}
      {showMemoryHelp && (
        <div className="modal-overlay" onClick={() => setShowMemoryHelp(false)}>
          <div className="bottom-sheet" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <HelpCircle size={22} color="var(--accent-gold)" />
                <h3 style={{ fontSize: 18, color: 'var(--text-secondary)', fontFamily: 'var(--font-display)' }}>
                  Fixing &ldquo;Low Memory&rdquo; on Android
                </h3>
              </div>
              <button className="icon-btn" onClick={() => setShowMemoryHelp(false)} aria-label="Close">
                <X size={20} />
              </button>
            </div>

            <p style={{ color: 'var(--text-primary)', marginBottom: 16, lineHeight: 1.5 }}>
              The &ldquo;Unable to complete operation due to low memory&rdquo; alert is an Android system message when the phone has low free RAM when opening the file picker. Here is how to fix it in 30 seconds:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span style={{ 
                  background: 'var(--accent-gold)', 
                  color: '#141210', 
                  width: 24, 
                  height: 24, 
                  borderRadius: '50%', 
                  display: 'inline-flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  fontWeight: 700, 
                  fontSize: 12,
                  flexShrink: 0 
                }}>1</span>
                <div>
                  <p style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Close Heavy Background Apps</p>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    Swipe up on your phone to open recent apps and close heavy apps like WhatsApp, Camera, YouTube, or Games to free up RAM.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span style={{ 
                  background: 'var(--accent-gold)', 
                  color: '#141210', 
                  width: 24, 
                  height: 24, 
                  borderRadius: '50%', 
                  display: 'inline-flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  fontWeight: 700, 
                  fontSize: 12,
                  flexShrink: 0 
                }}>2</span>
                <div>
                  <p style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Try &ldquo;Select from All Files (*/*)&rdquo;</p>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    Tap the grey button above. It uses Android&apos;s generic file selector which consumes far less memory than the media scanner.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span style={{ 
                  background: 'var(--accent-gold)', 
                  color: '#141210', 
                  width: 24, 
                  height: 24, 
                  borderRadius: '50%', 
                  display: 'inline-flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  fontWeight: 700, 
                  fontSize: 12,
                  flexShrink: 0 
                }}>3</span>
                <div>
                  <p style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Check Developer Options (Most Common)</p>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    If you have Developer Options enabled in Android Settings, ensure <strong>&ldquo;Don&apos;t keep activities&rdquo;</strong> is turned <strong>OFF</strong>.
                  </p>
                </div>
              </div>
            </div>

            <button
              className="primary-btn"
              onClick={() => {
                setShowMemoryHelp(false);
                allFilesInputRef.current?.click();
              }}
              style={{ width: '100%' }}
            >
              <FileText size={18} />
              <span>Try Selecting via All Files (*/*)</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
