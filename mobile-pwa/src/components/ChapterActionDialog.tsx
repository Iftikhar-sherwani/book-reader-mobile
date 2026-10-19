import React, { useState, useEffect, useRef } from 'react';
import { Target, X, Check, SkipForward } from 'lucide-react';

interface ChapterActionDialogProps {
  bookTitle?: string;
  locationLabel: string; // e.g. "Chapter 3" or "Page 42"
  onSave: (text: string) => void;
  onSkip: () => void;
}

export const ChapterActionDialog: React.FC<ChapterActionDialogProps> = ({
  bookTitle,
  locationLabel,
  onSave,
  onSkip,
}) => {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // Focus textarea on mount
    const timer = setTimeout(() => {
      textareaRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (text.trim()) {
        onSave(text.trim());
      } else {
        onSkip();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onSkip();
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim()) {
      onSave(text.trim());
    } else {
      onSkip();
    }
  };

  return (
    <div className="modal-overlay" onClick={onSkip} style={{ zIndex: 120 }}>
      <div
        className="modal-box"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 440,
          width: '92%',
          background: 'linear-gradient(135deg, #24201B, #1B1814)',
          border: '1px solid var(--border-highlight)',
          borderRadius: 16,
          padding: 20,
          boxShadow: '0 12px 36px rgba(0, 0, 0, 0.65)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                backgroundColor: 'rgba(212, 175, 85, 0.15)',
                border: '1px solid rgba(212, 175, 85, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-gold)',
                flexShrink: 0,
              }}
            >
              <Target size={20} />
            </div>
            <div>
              <h3
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  margin: 0,
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-serif)',
                }}
              >
                What will you do with this?
              </h3>
              {(bookTitle || locationLabel) && (
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--accent-gold)',
                    marginTop: 2,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  {locationLabel}
                  {bookTitle && (
                    <>
                      <span>•</span>
                      <span
                        style={{
                          maxWidth: 200,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          color: 'var(--text-muted)',
                        }}
                      >
                        {bookTitle}
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
          <button
            className="icon-btn"
            onClick={onSkip}
            aria-label="Skip and close"
            style={{ width: 32, height: 32 }}
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Write an action step, takeaway, or practical commitment..."
              rows={4}
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: 10,
                backgroundColor: 'var(--bg-elevated)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-subtle)',
                fontSize: 14,
                fontFamily: 'var(--font-ui)',
                resize: 'none',
                outline: 'none',
                lineHeight: 1.5,
              }}
            />
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 11,
                color: 'var(--text-muted)',
                marginTop: 4,
                padding: '0 2px',
              }}
            >
              <span>Captured in your Actions list</span>
              <span>Ctrl+Enter to save</span>
            </div>
          </div>

          {/* Action buttons: Skip and Save */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button
              type="button"
              className="secondary-btn"
              onClick={onSkip}
              style={{
                flex: 1,
                height: 42,
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              <SkipForward size={14} />
              <span>Skip</span>
            </button>

            <button
              type="submit"
              className="primary-btn"
              disabled={!text.trim()}
              style={{
                flex: 1.5,
                height: 42,
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 600,
                opacity: text.trim() ? 1 : 0.6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              <Check size={16} />
              <span>Save Action</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
