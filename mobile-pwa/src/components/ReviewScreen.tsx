import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Eye, EyeOff, RotateCcw, Brain, Zap, Sparkles, CheckCircle2 } from 'lucide-react';
import { getDueReviews, rateReview } from '../services/db';

interface ReviewCard {
  markId: string;
  due: string;
  intervalDays: number;
  quote: string;
  note?: string;
  bookTitle: string;
}

interface ReviewScreenProps {
  onClose: () => void;
}

export const ReviewScreen: React.FC<ReviewScreenProps> = ({ onClose }) => {
  const [cards, setCards] = useState<ReviewCard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showNote, setShowNote] = useState(false);
  const [loading, setLoading] = useState(true);
  const [animating, setAnimating] = useState(false);
  const [totalReviewed, setTotalReviewed] = useState(0);

  const loadCards = useCallback(async () => {
    setLoading(true);
    try {
      const due = await getDueReviews(10);
      setCards(due);
      setCurrentIndex(0);
      setShowNote(false);
    } catch (err) {
      console.error('Failed to load review cards:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCards();
  }, [loadCards]);

  const handleRate = async (rating: 'forgot' | 'hard' | 'good' | 'easy') => {
    if (animating) return;
    const card = cards[currentIndex];
    if (!card) return;

    setAnimating(true);
    try {
      await rateReview(card.markId, rating);
      setTotalReviewed((n) => n + 1);
    } catch (err) {
      console.error('Failed to rate review:', err);
    }

    // Brief animation delay then advance
    setTimeout(() => {
      const remaining = cards.filter((_, i) => i !== currentIndex);
      setCards(remaining);
      if (remaining.length > 0) {
        setCurrentIndex(0);
      }
      setShowNote(false);
      setAnimating(false);
    }, 300);
  };

  const currentCard = cards.length > 0 ? cards[currentIndex] : null;
  const isDone = !loading && cards.length === 0;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        backgroundColor: 'var(--bg-main)',
        display: 'flex',
        flexDirection: 'column',
        animation: 'fadeIn 0.2s ease-out',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          paddingTop: 'calc(12px + var(--safe-top))',
          borderBottom: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-surface)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="icon-btn" onClick={onClose} aria-label="Back">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2
              style={{
                fontSize: 17,
                fontWeight: 700,
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-display)',
              }}
            >
              Daily Review
            </h2>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Spaced repetition
            </span>
          </div>
        </div>
        {!isDone && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px',
              borderRadius: 8,
              backgroundColor: 'rgba(212, 175, 85, 0.12)',
              border: '1px solid rgba(212, 175, 85, 0.25)',
            }}
          >
            <Brain size={14} color="var(--accent-gold)" />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-gold)' }}>
              {cards.length} left
            </span>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          padding: '20px 16px calc(20px + var(--safe-bottom))',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: isDone ? 'center' : 'flex-start',
          gap: 20,
        }}
      >
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <Brain size={40} color="var(--accent-gold)" style={{ marginBottom: 12, opacity: 0.6 }} />
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading review cards...</p>
          </div>
        ) : isDone ? (
          /* Done state */
          <div
            style={{
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 16,
              maxWidth: 320,
            }}
          >
            <div
              style={{
                width: 80,
                height: 80,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, rgba(152, 195, 121, 0.2), rgba(152, 195, 121, 0.05))',
                border: '2px solid rgba(152, 195, 121, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CheckCircle2 size={40} color="var(--success)" />
            </div>
            <div>
              <h3
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-display)',
                  marginBottom: 8,
                }}
              >
                Done for today!
              </h3>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                {totalReviewed > 0
                  ? `Great work! You reviewed ${totalReviewed} card${totalReviewed > 1 ? 's' : ''} this session.`
                  : 'No reviews are due right now. Keep reading and marking passages!'}
              </p>
            </div>
            <button
              className="primary-btn"
              onClick={onClose}
              style={{ width: '100%', marginTop: 8 }}
            >
              Back to Library
            </button>
          </div>
        ) : currentCard ? (
          /* Active review card */
          <div
            style={{
              width: '100%',
              maxWidth: 480,
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              opacity: animating ? 0.4 : 1,
              transform: animating ? 'translateX(60px)' : 'translateX(0)',
              transition: 'opacity 0.25s ease, transform 0.25s ease',
            }}
          >
            {/* Progress indicator */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                fontSize: 12,
                color: 'var(--text-muted)',
              }}
            >
              <span>
                Card {totalReviewed + 1}
              </span>
              <span>•</span>
              <span>Next in {currentCard.intervalDays}d</span>
            </div>

            {/* Book title badge */}
            <div style={{ textAlign: 'center' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '5px 14px',
                  borderRadius: 20,
                  backgroundColor: 'rgba(212, 175, 85, 0.1)',
                  border: '1px solid rgba(212, 175, 85, 0.2)',
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--accent-gold)',
                  maxWidth: '100%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                📖 {currentCard.bookTitle}
              </span>
            </div>

            {/* Quote card */}
            <div
              style={{
                padding: '24px 20px',
                borderRadius: 16,
                background: 'linear-gradient(135deg, var(--bg-surface), var(--bg-elevated))',
                border: '1px solid var(--border-highlight)',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
                position: 'relative',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 16,
                  left: 18,
                  fontSize: 36,
                  lineHeight: 1,
                  color: 'var(--accent-gold)',
                  opacity: 0.2,
                  fontFamily: 'var(--font-serif)',
                  fontWeight: 700,
                }}
              >
                "
              </div>
              <blockquote
                style={{
                  fontSize: 17,
                  lineHeight: 1.7,
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-serif)',
                  fontStyle: 'italic',
                  padding: '8px 0 0 4px',
                  margin: 0,
                  border: 'none',
                  maxHeight: 260,
                  overflowY: 'auto',
                }}
              >
                {currentCard.quote}
              </blockquote>
            </div>

            {/* Show/Hide Note */}
            {currentCard.note ? (
              <div>
                <button
                  onClick={() => setShowNote(!showNote)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    width: '100%',
                    padding: '12px 16px',
                    borderRadius: 12,
                    backgroundColor: showNote ? 'rgba(97, 175, 239, 0.1)' : 'var(--bg-surface)',
                    border: showNote
                      ? '1px solid rgba(97, 175, 239, 0.3)'
                      : '1px solid var(--border-subtle)',
                    color: showNote ? 'var(--info)' : 'var(--text-secondary)',
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {showNote ? <EyeOff size={16} /> : <Eye size={16} />}
                  {showNote ? 'Hide note' : 'Show note'}
                </button>
                {showNote && (
                  <div
                    style={{
                      marginTop: 10,
                      padding: '14px 16px',
                      borderRadius: 12,
                      backgroundColor: 'rgba(97, 175, 239, 0.06)',
                      border: '1px solid rgba(97, 175, 239, 0.15)',
                      borderLeft: '4px solid var(--info)',
                      color: 'var(--text-secondary)',
                      fontSize: 14,
                      lineHeight: 1.6,
                      animation: 'fadeIn 0.2s ease-out',
                    }}
                  >
                    {currentCard.note}
                  </div>
                )}
              </div>
            ) : (
              <div
                style={{
                  textAlign: 'center',
                  padding: '10px 0',
                  fontSize: 13,
                  color: 'var(--text-muted)',
                  fontStyle: 'italic',
                }}
              >
                No note for this mark
              </div>
            )}

            {/* Rating Buttons */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 10,
                marginTop: 8,
              }}
            >
              <button
                onClick={() => handleRate('forgot')}
                disabled={animating}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                  padding: '14px 12px',
                  borderRadius: 14,
                  backgroundColor: 'rgba(224, 108, 117, 0.1)',
                  border: '1px solid rgba(224, 108, 117, 0.25)',
                  color: 'var(--danger)',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <RotateCcw size={20} />
                <span>Forgot</span>
                <span style={{ fontSize: 10, fontWeight: 400, opacity: 0.7 }}>1 day</span>
              </button>

              <button
                onClick={() => handleRate('hard')}
                disabled={animating}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                  padding: '14px 12px',
                  borderRadius: 14,
                  backgroundColor: 'rgba(229, 192, 123, 0.1)',
                  border: '1px solid rgba(229, 192, 123, 0.25)',
                  color: '#E5C07B',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <Brain size={20} />
                <span>Hard</span>
                <span style={{ fontSize: 10, fontWeight: 400, opacity: 0.7 }}>
                  {Math.ceil(currentCard.intervalDays * 1.2)}d
                </span>
              </button>

              <button
                onClick={() => handleRate('good')}
                disabled={animating}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                  padding: '14px 12px',
                  borderRadius: 14,
                  backgroundColor: 'rgba(152, 195, 121, 0.1)',
                  border: '1px solid rgba(152, 195, 121, 0.25)',
                  color: 'var(--success)',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <Zap size={20} />
                <span>Good</span>
                <span style={{ fontSize: 10, fontWeight: 400, opacity: 0.7 }}>
                  {Math.ceil(currentCard.intervalDays * 2)}d
                </span>
              </button>

              <button
                onClick={() => handleRate('easy')}
                disabled={animating}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                  padding: '14px 12px',
                  borderRadius: 14,
                  backgroundColor: 'rgba(97, 175, 239, 0.1)',
                  border: '1px solid rgba(97, 175, 239, 0.25)',
                  color: 'var(--info)',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <Sparkles size={20} />
                <span>Easy</span>
                <span style={{ fontSize: 10, fontWeight: 400, opacity: 0.7 }}>
                  {Math.ceil(currentCard.intervalDays * 3)}d
                </span>
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
