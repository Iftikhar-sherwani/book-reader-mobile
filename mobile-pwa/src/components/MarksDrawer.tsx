import React from 'react';
import type { Book, Mark } from '../types';
import { Highlighter, Trash2, X, Download, Clock } from 'lucide-react';
import { exportBookMarks } from '../services/marksExporter';

interface MarksDrawerProps {
  book: Book;
  marks: Mark[];
  onSelectMark: (mark: Mark) => void;
  onDeleteMark: (id: string) => void;
  onClose: () => void;
}

const COLOR_DOTS: Record<string, string> = {
  '#FFF3B0': '🟡',
  '#B8E6C8': '🟢',
  '#B3D4FC': '🔵',
  '#F8BBD0': '🩷',
};

export const MarksDrawer: React.FC<MarksDrawerProps> = ({
  book,
  marks,
  onSelectMark,
  onDeleteMark,
  onClose,
}) => {
  const handleExport = () => {
    exportBookMarks(book, marks);
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 90 }}>
      <div className="bottom-sheet" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '82vh' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Highlighter size={20} color="var(--accent-gold)" />
            <h3 style={{ fontSize: 18, margin: 0, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
              Marks & Notes ({marks.length})
            </h3>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close marks drawer">
            <X size={20} />
          </button>
        </div>

        {/* Export to Markdown Button */}
        {marks.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <button
              className="primary-btn"
              onClick={handleExport}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                backgroundColor: 'rgba(212, 175, 85, 0.15)',
                color: 'var(--accent-gold)',
                border: '1px solid var(--accent-gold)',
              }}
            >
              <Download size={16} />
              <span>Export to Markdown (.md)</span>
            </button>
          </div>
        )}

        {/* Marks List */}
        {marks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '36px 20px', color: 'var(--text-muted)' }}>
            <p>No marks saved in this book yet.</p>
            <p style={{ fontSize: 13, marginTop: 6 }}>
              Select any text while reading to highlight and add notes.
            </p>
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              maxHeight: 'calc(80vh - 120px)',
              overflowY: 'auto',
            }}
          >
            {marks.map((m) => {
              const dot = COLOR_DOTS[m.color] || '●';
              const parts = m.loc.split('|');
              const locLabel = book.format === 'epub' ? `Chapter ${parts[0] || '1'}` : `Page ${parts[0] || '1'}`;

              return (
                <div
                  key={m.id}
                  onClick={() => onSelectMark(m)}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    borderRadius: 12,
                    backgroundColor: 'var(--bg-elevated)',
                    borderLeft: `4px solid ${m.color}`,
                    border: '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0, marginRight: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 14 }}>{dot}</span>
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
                      {m.createdAt && (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 3, marginLeft: 'auto' }}>
                          <Clock size={10} />
                          {new Date(m.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                    </div>

                    <p
                      style={{
                        fontSize: 13,
                        color: 'var(--text-primary)',
                        lineHeight: 1.4,
                        margin: '4px 0',
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                      }}
                    >
                      "{m.quote}"
                    </p>

                    {m.note && (
                      <p
                        style={{
                          fontSize: 12,
                          color: 'var(--text-secondary)',
                          margin: '4px 0 0 0',
                          backgroundColor: 'rgba(0,0,0,0.15)',
                          padding: '4px 8px',
                          borderRadius: 6,
                          fontStyle: 'italic',
                        }}
                      >
                        📝 {m.note}
                      </p>
                    )}
                  </div>

                  <button
                    className="icon-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteMark(m.id);
                    }}
                    aria-label="Delete mark"
                    style={{ color: 'var(--danger)', flexShrink: 0, padding: 4 }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
