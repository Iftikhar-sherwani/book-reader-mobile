import React from 'react';
import type { Book } from '../types';
import { BookOpen, AlertCircle, X } from 'lucide-react';

interface DuplicateBookModalProps {
  existingBook: Book;
  onOpenExisting: () => void;
  onCancel: () => void;
}

export const DuplicateBookModal: React.FC<DuplicateBookModalProps> = ({
  existingBook,
  onOpenExisting,
  onCancel,
}) => {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-center" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertCircle size={22} color="var(--accent-gold)" />
            <h3 style={{ fontSize: 18, color: 'var(--text-secondary)', fontFamily: 'var(--font-display)' }}>
              Book Already in Library
            </h3>
          </div>
          <button className="icon-btn" onClick={onCancel} aria-label="Close dialog">
            <X size={20} />
          </button>
        </div>

        <p style={{ color: 'var(--text-primary)', marginBottom: 12, lineHeight: 1.5 }}>
          This book matches an existing copy already stored on your device:
        </p>

        <div
          style={{
            padding: 14,
            borderRadius: 12,
            backgroundColor: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            marginBottom: 20,
          }}
        >
          <p style={{ fontWeight: 600, fontSize: 15, color: 'var(--accent-gold)', marginBottom: 4 }}>
            {existingBook.title}
          </p>
          {existingBook.author && (
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>by {existingBook.author}</p>
          )}
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>
            Format: {existingBook.format.toUpperCase()} • {existingBook.pageCount > 0 ? `${existingBook.pageCount} pages` : 'Ready to read'}
          </p>
        </div>

        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
          Opening the existing book preserves your reading progress, notes, and bookmarks.
        </p>

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="secondary-btn" onClick={onCancel} style={{ flex: 1 }}>
            Cancel
          </button>
          <button className="primary-btn" onClick={onOpenExisting} style={{ flex: 1.2 }}>
            <BookOpen size={18} />
            <span>Open Book</span>
          </button>
        </div>
      </div>
    </div>
  );
};
