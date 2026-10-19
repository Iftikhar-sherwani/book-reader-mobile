import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Download, Copy, Check, Sparkles } from 'lucide-react';
import type { Book, Mark } from '../types';

interface QuoteCardModalProps {
  book: Book;
  mark: Mark;
  onClose: () => void;
}

type TemplateType = 'dark' | 'light' | 'sepia';

const TEMPLATES: Record<
  TemplateType,
  {
    name: string;
    bg: string;
    innerBorder: string;
    quoteMark: string;
    quoteText: string;
    divider: string;
    title: string;
    author: string;
  }
> = {
  dark: {
    name: 'Dark',
    bg: '#141210',
    innerBorder: 'rgba(212, 175, 85, 0.35)',
    quoteMark: '#D4AF55',
    quoteText: '#EDE4D3',
    divider: 'rgba(196, 179, 138, 0.4)',
    title: '#D4AF55',
    author: '#A0917D',
  },
  light: {
    name: 'Light',
    bg: '#FAF8F5',
    innerBorder: 'rgba(180, 140, 50, 0.4)',
    quoteMark: '#B3862A',
    quoteText: '#1F1B16',
    divider: 'rgba(180, 150, 100, 0.45)',
    title: '#8A5816',
    author: '#6E5F50',
  },
  sepia: {
    name: 'Sepia',
    bg: '#F4ECD8',
    innerBorder: 'rgba(140, 110, 70, 0.4)',
    quoteMark: '#9E6B1F',
    quoteText: '#3E3120',
    divider: 'rgba(160, 130, 90, 0.5)',
    title: '#7A4B10',
    author: '#7C694E',
  },
};

export const QuoteCardModal: React.FC<QuoteCardModalProps> = ({
  book,
  mark,
  onClose,
}) => {
  const [template, setTemplate] = useState<TemplateType>('dark');
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Helper to wrap text into lines on canvas
  const wrapText = (
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number
  ): string[] => {
    const words = text.split(/\s+/);
    if (!words.length) return [''];

    const lines: string[] = [];
    let currentLine = words[0];

    for (let i = 1; i < words.length; i++) {
      const word = words[i];
      const testLine = `${currentLine} ${word}`;
      const metrics = ctx.measureText(testLine);
      if (metrics.width <= maxWidth) {
        currentLine = testLine;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }
    lines.push(currentLine);
    return lines;
  };

  // Render 1080x1080 canvas
  const renderCard = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 1080;
    canvas.width = size;
    canvas.height = size;

    const colors = TEMPLATES[template];

    // 1. Solid Background
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, size, size);

    // 2. Decorative Double Border
    const inset1 = 48;
    ctx.strokeStyle = colors.innerBorder;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(inset1, inset1, size - inset1 * 2, size - inset1 * 2);

    const inset2 = 60;
    ctx.strokeStyle = colors.innerBorder;
    ctx.lineWidth = 1;
    ctx.strokeRect(inset2, inset2, size - inset2 * 2, size - inset2 * 2);

    // 3. Top quotation mark glyph
    ctx.fillStyle = colors.quoteMark;
    ctx.font = 'italic 100px "Lora", Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('“', size / 2, 140);

    // 4. Auto-sized Quote Text
    let cleanQuote = mark.quote.trim();
    if (cleanQuote.startsWith('"') || cleanQuote.startsWith('“')) cleanQuote = cleanQuote.slice(1);
    if (cleanQuote.endsWith('"') || cleanQuote.endsWith('”')) cleanQuote = cleanQuote.slice(0, -1);
    cleanQuote = cleanQuote.trim();

    const maxQuoteWidth = 840;
    const maxQuoteHeight = 560;

    let selectedFontSize = 26;
    let selectedLines: string[] = [cleanQuote];
    let selectedLineHeight = 40;

    // Test font sizes descending from 64 down to 22
    for (let fSize = 64; fSize >= 22; fSize -= 2) {
      ctx.font = `italic ${fSize}px "Lora", Georgia, serif`;
      const lines = wrapText(ctx, cleanQuote, maxQuoteWidth);
      const lineHeight = Math.round(fSize * 1.55);
      const totalH = lines.length * lineHeight;

      if (totalH <= maxQuoteHeight) {
        selectedFontSize = fSize;
        selectedLines = lines;
        selectedLineHeight = lineHeight;
        break;
      }
    }

    // Vertically center quote lines inside quote box (Y: 220 to 800)
    const quoteBoxTop = 220;
    const totalQuoteHeight = selectedLines.length * selectedLineHeight;
    const startY = quoteBoxTop + Math.max(0, (maxQuoteHeight - totalQuoteHeight) / 2);

    ctx.fillStyle = colors.quoteText;
    ctx.font = `italic ${selectedFontSize}px "Lora", Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    selectedLines.forEach((line, index) => {
      ctx.fillText(line, size / 2, startY + index * selectedLineHeight);
    });

    // 5. Divider Line
    const dividerY = 855;
    const dividerHalfWidth = 80;
    ctx.strokeStyle = colors.divider;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(size / 2 - dividerHalfWidth, dividerY);
    ctx.lineTo(size / 2 + dividerHalfWidth, dividerY);
    ctx.stroke();

    // 6. Book Title
    ctx.fillStyle = colors.title;
    ctx.font = '600 30px "Cinzel", "Lora", Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    let displayTitle = book.title.trim();
    if (displayTitle.length > 55) {
      displayTitle = `${displayTitle.slice(0, 52)}...`;
    }
    ctx.fillText(displayTitle, size / 2, 905);

    // 7. Author (if known)
    if (book.author && book.author.trim()) {
      ctx.fillStyle = colors.author;
      ctx.font = '400 22px "Outfit", -apple-system, sans-serif';
      ctx.fillText(`by ${book.author.trim()}`, size / 2, 955);
    }
  }, [book.author, book.title, mark.quote, template]);

  useEffect(() => {
    renderCard();
  }, [renderCard]);

  // Download 1080x1080 PNG
  const handleSavePng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const link = document.createElement('a');
    const safeTitle = book.title.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
    link.download = `Quote_${safeTitle}_${template}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  // Copy 1080x1080 PNG to Clipboard
  const handleCopyClipboard = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        try {
          await navigator.clipboard.write([
            new ClipboardItem({
              'image/png': blob,
            }),
          ]);
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
        } catch (err) {
          // Fallback if ClipboardItem write not permitted
          const item = new ClipboardItem({ 'image/png': blob });
          await navigator.clipboard.write([item]);
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
        }
      }, 'image/png');
    } catch (err) {
      console.warn('Failed to copy image to clipboard:', err);
      alert('Unable to write image directly to clipboard in this browser. Please use "Save PNG".');
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        zIndex: 110,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '92%',
          maxWidth: 540,
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 20,
          borderRadius: 20,
          backgroundColor: '#1A1714',
          border: '1px solid var(--border-highlight)',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.7)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={18} color="var(--accent-gold)" />
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              Quote Card (1080×1080)
            </h3>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close quote card modal">
            <X size={18} />
          </button>
        </div>

        {/* Template Selector Row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Template:</span>
          {(['dark', 'light', 'sepia'] as TemplateType[]).map((t) => (
            <button
              key={t}
              onClick={() => setTemplate(t)}
              style={{
                padding: '6px 14px',
                borderRadius: 18,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                border: template === t ? '1px solid var(--accent-gold)' : '1px solid var(--border-subtle)',
                backgroundColor: template === t ? 'rgba(212, 175, 85, 0.2)' : 'var(--bg-elevated)',
                color: template === t ? 'var(--accent-gold)' : 'var(--text-secondary)',
                transition: 'all 0.15s ease',
              }}
            >
              {TEMPLATES[t].name}
            </button>
          ))}
        </div>

        {/* Preview Canvas */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            borderRadius: 12,
            border: '1px solid var(--border-subtle)',
            backgroundColor: '#0E0D0C',
            padding: 8,
            marginBottom: 16,
          }}
        >
          <canvas
            ref={canvasRef}
            style={{
              width: '100%',
              maxWidth: 420,
              aspectRatio: '1 / 1',
              borderRadius: 8,
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)',
              display: 'block',
            }}
          />
        </div>

        {/* Action Buttons: Save PNG, Copy to Clipboard */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="secondary-btn"
            onClick={handleCopyClipboard}
            style={{
              flex: 1,
              height: 42,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              fontSize: 13,
            }}
          >
            {copied ? <Check size={16} color="var(--success)" /> : <Copy size={16} />}
            <span>{copied ? 'Copied Image!' : 'Copy to Clipboard'}</span>
          </button>

          <button
            className="primary-btn"
            onClick={handleSavePng}
            style={{
              flex: 1,
              height: 42,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              fontSize: 13,
            }}
          >
            <Download size={16} />
            <span>Save PNG</span>
          </button>
        </div>
      </div>
    </div>
  );
};
