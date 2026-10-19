import React, { useState, useEffect } from 'react';
import { BookOpen, X, BookmarkCheck, Plus, Loader2, Sparkles, Volume2 } from 'lucide-react';
import { lookupWord, type DictionaryEntry } from '../services/dictionaryService';
import { saveVocabWord, isWordSaved } from '../services/db';

interface DictionaryPopupProps {
  word: string;
  bookTitle?: string;
  onClose: () => void;
  onWordSaved?: (word: string) => void;
}

export const DictionaryPopup: React.FC<DictionaryPopupProps> = ({
  word,
  bookTitle,
  onClose,
  onWordSaved,
}) => {
  const [loading, setLoading] = useState(true);
  const [entry, setEntry] = useState<DictionaryEntry | null>(null);
  const [alreadySaved, setAlreadySaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;

    const fetchDef = async () => {
      setLoading(true);
      try {
        const [result, saved] = await Promise.all([
          lookupWord(word),
          isWordSaved(word),
        ]);
        if (mounted) {
          setEntry(result);
          setAlreadySaved(saved);
          setLoading(false);
        }
      } catch {
        if (mounted) {
          setEntry(null);
          setLoading(false);
        }
      }
    };

    fetchDef();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      mounted = false;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [word, onClose]);

  const handleSaveWord = async () => {
    if (alreadySaved || saving) return;
    setSaving(true);
    try {
      const defToSave = entry?.definition || 'No definition found.';
      await saveVocabWord(entry?.word || word, defToSave, bookTitle || 'General');
      setAlreadySaved(true);
      onWordSaved?.(entry?.word || word);
    } catch (err) {
      console.warn('Failed to save word to vocab:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 110 }}>
      <div
        className="modal-box"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 420,
          width: '92%',
          background: 'linear-gradient(135deg, #24201B, #1B1814)',
          border: '1px solid var(--border-highlight)',
          borderRadius: 16,
          padding: '20px 22px',
          boxShadow: '0 12px 36px rgba(0, 0, 0, 0.65)',
        }}
      >
        {/* Top Header Row */}
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
              <BookOpen size={18} />
            </div>

            <div>
              <h3
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  margin: 0,
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-serif)',
                  letterSpacing: '0.3px',
                }}
              >
                {entry?.word || word}
              </h3>

              {/* Phonetic & Part of speech */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                {entry?.phonetic && (
                  <span style={{ fontSize: 13, color: 'var(--accent-gold)', fontFamily: 'monospace' }}>
                    {entry.phonetic}
                  </span>
                )}
                {entry?.partOfSpeech && (
                  <span
                    className="badge badge-gold"
                    style={{ fontSize: 10, padding: '1px 6px', textTransform: 'uppercase' }}
                  >
                    {entry.partOfSpeech}
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            className="icon-btn"
            onClick={onClose}
            aria-label="Close"
            style={{ width: 32, height: 32, flexShrink: 0 }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Content Body */}
        <div style={{ minHeight: 70, margin: '14px 0 18px 0' }}>
          {loading ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                padding: '24px 0',
                color: 'var(--text-muted)',
                fontSize: 14,
              }}
            >
              <Loader2 size={18} className="spin-slow" color="var(--accent-gold)" />
              <span>Looking up definition...</span>
            </div>
          ) : entry && entry.definition ? (
            <div
              style={{
                padding: '12px 14px',
                borderRadius: 10,
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                fontSize: 14,
                lineHeight: 1.6,
                color: 'var(--text-primary)',
              }}
            >
              {entry.definition}
            </div>
          ) : (
            <div
              style={{
                padding: '14px 16px',
                borderRadius: 10,
                backgroundColor: 'rgba(140, 127, 109, 0.08)',
                border: '1px dashed var(--border-subtle)',
                fontSize: 14,
                color: 'var(--text-muted)',
                textAlign: 'center',
                lineHeight: 1.5,
              }}
            >
              No definition found.
            </div>
          )}
        </div>

        {/* Footer Actions: Save Word and Close */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center' }}>
          <button
            type="button"
            className="secondary-btn"
            onClick={onClose}
            style={{
              padding: '0 16px',
              height: 40,
              borderRadius: 10,
              fontSize: 13,
            }}
          >
            Close
          </button>

          <button
            type="button"
            className="primary-btn"
            onClick={handleSaveWord}
            disabled={alreadySaved || saving}
            style={{
              height: 40,
              padding: '0 18px',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 600,
              backgroundColor: alreadySaved ? 'rgba(152, 195, 121, 0.2)' : 'var(--accent-gold)',
              color: alreadySaved ? 'var(--success)' : '#141210',
              border: alreadySaved ? '1px solid var(--success)' : 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              cursor: alreadySaved ? 'default' : 'pointer',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {alreadySaved ? (
              <>
                <BookmarkCheck size={16} />
                <span>Saved</span>
              </>
            ) : (
              <>
                <Plus size={16} />
                <span>Save word</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
