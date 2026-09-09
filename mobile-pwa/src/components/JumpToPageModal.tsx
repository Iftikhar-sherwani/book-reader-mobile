import React, { useState } from 'react';
import { ArrowRight, X } from 'lucide-react';

interface JumpToPageModalProps {
  currentPage: number;
  totalPages: number;
  onJump: (page: number) => void;
  onClose: () => void;
}

export const JumpToPageModal: React.FC<JumpToPageModalProps> = ({
  currentPage,
  totalPages,
  onJump,
  onClose,
}) => {
  const [value, setValue] = useState(currentPage.toString());
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const pageNum = parseInt(value, 10);
    if (isNaN(pageNum)) {
      setError('Please enter a valid number');
      return;
    }
    if (pageNum < 1 || pageNum > totalPages) {
      setError(`Page must be between 1 and ${totalPages}`);
      return;
    }
    onJump(pageNum);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-center"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 360 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 18, color: 'var(--text-secondary)', fontFamily: 'var(--font-display)' }}>
            ✦ Jump to Page
          </h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close dialog">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
              Enter page number (1 – {totalPages})
            </label>
            <input
              type="number"
              inputMode="numeric"
              pattern="[0-9]*"
              min={1}
              max={totalPages}
              value={value}
              autoFocus
              onChange={(e) => {
                setValue(e.target.value);
                setError(null);
              }}
              style={{
                width: '100%',
                height: 52,
                fontSize: 22,
                fontWeight: 600,
                textAlign: 'center',
                backgroundColor: 'var(--bg-elevated)',
                color: 'var(--text-primary)',
                border: error ? '1px solid var(--danger)' : '1px solid var(--border-subtle)',
                borderRadius: 12,
                outline: 'none',
              }}
            />
            {error && (
              <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 6, textAlign: 'center' }}>
                {error}
              </p>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              className="secondary-btn"
              onClick={onClose}
              style={{ flex: 1 }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="primary-btn"
              style={{ flex: 1 }}
            >
              <span>Go</span>
              <ArrowRight size={18} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
