import React, { useState } from 'react';
import { Highlighter, X, Check } from 'lucide-react';

interface MarkDialogProps {
  quote: string;
  onSave: (color: string, note: string) => void;
  onClose: () => void;
  onLookupVocab?: (word: string) => void;
}

const COLORS = [
  { value: '#FFF3B0', label: 'Yellow', dot: '🟡' },
  { value: '#B8E6C8', label: 'Green', dot: '🟢' },
  { value: '#B3D4FC', label: 'Blue', dot: '🔵' },
  { value: '#F8BBD0', label: 'Pink', dot: '🩷' },
];

export const MarkDialog: React.FC<MarkDialogProps> = ({ quote, onSave, onClose, onLookupVocab }) => {
  const [selectedColor, setSelectedColor] = useState(COLORS[0].value);
  const [note, setNote] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(selectedColor, note.trim());
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 100 }}>
      <div
        className="modal-box"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 440, width: '92%' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Highlighter size={20} color="var(--accent-gold)" />
            <h3 style={{ fontSize: 17, margin: 0, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
              Mark Selection
            </h3>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Selected Quote preview */}
        <div
          style={{
            maxHeight: 100,
            overflowY: 'auto',
            padding: '10px 12px',
            borderRadius: 8,
            backgroundColor: 'var(--bg-elevated)',
            borderLeft: `4px solid ${selectedColor}`,
            fontSize: 13,
            color: 'var(--text-secondary)',
            fontStyle: 'italic',
            lineHeight: 1.5,
            marginBottom: 16,
          }}
        >
          "{quote}"
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Color pickers */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, display: 'block' }}>
              HIGHLIGHT COLOR
            </label>
            <div style={{ display: 'flex', gap: 12 }}>
              {COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setSelectedColor(c.value)}
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: '50%',
                    backgroundColor: c.value,
                    border: selectedColor === c.value ? '3px solid var(--accent-gold)' : '1px solid rgba(0,0,0,0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    boxShadow: selectedColor === c.value ? '0 0 8px rgba(212,175,85,0.6)' : 'none',
                    transform: selectedColor === c.value ? 'scale(1.1)' : 'scale(1)',
                    transition: 'transform 0.15s ease',
                  }}
                  title={c.label}
                  aria-label={c.label}
                >
                  {selectedColor === c.value && <Check size={18} color="#111" />}
                </button>
              ))}
            </div>
          </div>

          {/* Optional Note */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>
              ADD A NOTE (OPTIONAL)
            </label>
            <input
              type="text"
              placeholder="Your note or reflection..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              style={{
                width: '100%',
                height: 40,
                padding: '0 12px',
                borderRadius: 8,
                backgroundColor: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
                fontSize: 14,
              }}
              autoFocus
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
            <button
              type="button"
              className="primary-btn"
              onClick={onClose}
              style={{ backgroundColor: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}
            >
              Cancel
            </button>
            {onLookupVocab && (
              <button
                type="button"
                className="primary-btn"
                onClick={() => {
                  const clean = quote.trim().replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '');
                  onLookupVocab(clean || quote.trim());
                }}
                style={{
                  backgroundColor: 'rgba(212, 175, 85, 0.15)',
                  border: '1px solid var(--accent-gold)',
                  color: 'var(--accent-gold)',
                }}
              >
                📖 Vocab Lookup
              </button>
            )}
            <button type="submit" className="primary-btn" style={{ minWidth: 100 }}>
              Save Mark
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
