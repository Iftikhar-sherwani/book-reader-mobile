import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import type { ReaderSettings, Mark } from '../types';
import { parseEpub, type ParsedEpub } from '../services/epubService';
import { MarkDialog } from './MarkDialog';
import { Loader2, ChevronRight } from 'lucide-react';

interface EpubReaderProps {
  blob: Blob;
  currentChapter: number;
  initialScrollOffset: number;
  settings: ReaderSettings;
  marks: Mark[];
  onPageCountLoaded: (count: number) => void;
  onChapterChange: (chapterIndex: number, scrollOffset: number) => void;
  onAddMark: (quote: string, color: string, note: string, chapterIndex: number, scrollY: number) => void;
  onToggleControls: () => void;
  onError: (err: string) => void;
  onLookupWord?: (word: string) => void;
}

function applyHighlights(html: string, chapterMarks: Mark[]): string {
  if (!chapterMarks || chapterMarks.length === 0) return html;
  let result = html;
  for (const m of chapterMarks) {
    if (!m.quote || m.quote.trim().length === 0) continue;
    const q = m.quote.trim();
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    try {
      // Replace text occurrence outside of html tags
      const regex = new RegExp(`(?![^<]*>)(${escaped})`, 'i');
      if (regex.test(result)) {
        result = result.replace(
          regex,
          `<mark style="background-color: ${m.color}; color: #111; border-radius: 2px; padding: 1px 3px;">$1</mark>`
        );
      }
    } catch {
      // If regex errors, skip quietly without error
    }
  }
  return result;
}

export const EpubReader: React.FC<EpubReaderProps> = ({
  blob,
  currentChapter,
  initialScrollOffset,
  settings,
  marks,
  onPageCountLoaded,
  onChapterChange,
  onAddMark,
  onToggleControls,
  onError,
  onLookupWord,
}) => {
  const [parsed, setParsed] = useState<ParsedEpub | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedQuote, setSelectedQuote] = useState<string | null>(null);
  const [savedScrollY, setSavedScrollY] = useState<number>(0);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const contentContainerRef = useRef<HTMLDivElement>(null);
  const selectionTimeoutRef = useRef<any>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        setLoading(true);
        const res = await parseEpub(blob);
        if (mounted) {
          setParsed(res);
          onPageCountLoaded(res.totalChapters);
          setLoading(false);
        }
      } catch (err: any) {
        if (mounted) {
          onError(err?.message || 'Failed to parse EPUB archive.');
          setLoading(false);
        }
      }
    };
    load();
    return () => {
      mounted = false;
      if (selectionTimeoutRef.current) clearTimeout(selectionTimeoutRef.current);
    };
  }, [blob, onPageCountLoaded, onError]);

  // Restore scroll position when chapter changes or on initial mount
  useEffect(() => {
    if (!scrollContainerRef.current) return;
    if (initialScrollOffset > 0) {
      scrollContainerRef.current.scrollTop = initialScrollOffset;
    } else {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [currentChapter, initialScrollOffset]);

  // Handle scroll events to report progress
  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current) return;
    const el = scrollContainerRef.current;
    onChapterChange(currentChapter, el.scrollTop);
  }, [currentChapter, onChapterChange]);

  const handleSelection = () => {
    if (selectionTimeoutRef.current) {
      clearTimeout(selectionTimeoutRef.current);
    }
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const text = sel.toString().trim();
    if (text.length >= 2) {
      const scrollY = scrollContainerRef.current?.scrollTop || 0;
      setSavedScrollY(scrollY);

      // If single word without spaces, delay opening MarkDialog so double-click can trigger dictionary popup instead
      if (!text.includes(' ') && text.length <= 40) {
        selectionTimeoutRef.current = setTimeout(() => {
          setSelectedQuote(text);
        }, 280);
      } else {
        setSelectedQuote(text);
      }
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (selectionTimeoutRef.current) {
      clearTimeout(selectionTimeoutRef.current);
    }
    const sel = window.getSelection();
    const raw = sel ? sel.toString().trim() : '';
    const clean = raw.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '');
    if (clean && clean.length >= 1 && !clean.includes(' ')) {
      e.stopPropagation();
      setSelectedQuote(null);
      window.getSelection()?.removeAllRanges();
      onLookupWord?.(clean);
    }
  };

  const handleSaveMark = (color: string, note: string) => {
    if (selectedQuote) {
      onAddMark(selectedQuote, color, note, currentChapter, savedScrollY);
      setSelectedQuote(null);
      window.getSelection()?.removeAllRanges();
    }
  };

  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.toString().trim().length >= 2) {
      return; // User was selecting text
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;

    if (settings.tapToTurn) {
      if (clickX < width * 0.2) {
        if (currentChapter > 1) onChapterChange(currentChapter - 1, 0);
        return;
      }
      if (clickX > width * 0.8) {
        if (parsed && currentChapter < parsed.totalChapters) onChapterChange(currentChapter + 1, 0);
        return;
      }
    }

    onToggleControls();
  };

  // Filter marks for current chapter
  const currentChapterMarks = useMemo(() => {
    return marks.filter((m) => {
      const parts = m.loc.split('|');
      return parts[0] === String(currentChapter);
    });
  }, [marks, currentChapter]);

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-gold)' }}>
        <Loader2 size={32} className="spin-slow" />
        <span style={{ marginLeft: 10 }}>Loading EPUB...</span>
      </div>
    );
  }

  if (!parsed || parsed.chapters.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
        No readable chapters found in this EPUB.
      </div>
    );
  }

  const activeChapterIndex = Math.max(0, Math.min(currentChapter - 1, parsed.chapters.length - 1));
  const rawChapter = parsed.chapters[activeChapterIndex];
  const highlightedContent = applyHighlights(rawChapter.content, currentChapterMarks);

  // Feature 12: Injected CSS for themes (Light, Sepia, Dark) and line width
  const injectedThemeCss = useMemo(() => {
    const theme = settings.theme || 'dark';
    const fontSize = settings.fontSize || 18;
    const lineHeight = settings.lineHeight || 1.6;
    const lineWidth = settings.lineWidth || 680;
    const fontFam = settings.fontFamily === 'serif' ? 'var(--font-serif), Georgia, serif' : 'var(--font-ui), sans-serif';

    let bg = '#141210';
    let text = '#EDE4D3';
    let heading = '#FAF3E8';
    let link = '#D4AF55';
    let border = 'rgba(196, 179, 138, 0.2)';
    let blockquoteBg = 'rgba(212, 175, 85, 0.08)';

    if (theme === 'light') {
      bg = '#FAF8F5';
      text = '#1F1B16';
      heading = '#110F0C';
      link = '#9E6B1F';
      border = 'rgba(120, 100, 70, 0.2)';
      blockquoteBg = 'rgba(0, 0, 0, 0.04)';
    } else if (theme === 'sepia') {
      bg = '#F4ECD8';
      text = '#3E3120';
      heading = '#2A1F10';
      link = '#8A5816';
      border = 'rgba(140, 110, 70, 0.25)';
      blockquoteBg = 'rgba(140, 110, 70, 0.1)';
    }

    return `
      .epub-themed-scroll {
        background-color: ${bg} !important;
        color: ${text} !important;
        transition: background-color 0.2s ease, color 0.2s ease;
      }
      .epub-content-container {
        max-width: ${lineWidth}px !important;
        margin: 0 auto !important;
        font-size: ${fontSize}px !important;
        line-height: ${lineHeight} !important;
        font-family: ${fontFam} !important;
        color: ${text} !important;
      }
      .epub-content-container p,
      .epub-content-container div,
      .epub-content-container span,
      .epub-content-container li {
        font-size: ${fontSize}px !important;
        line-height: ${lineHeight} !important;
        font-family: ${fontFam} !important;
        color: ${text} !important;
      }
      .epub-content-container h1,
      .epub-content-container h2,
      .epub-content-container h3,
      .epub-content-container h4,
      .epub-content-container h5,
      .epub-content-container h6 {
        color: ${heading} !important;
        font-family: ${fontFam} !important;
      }
      .epub-content-container a {
        color: ${link} !important;
      }
      .epub-content-container blockquote {
        border-left: 3px solid ${link} !important;
        background-color: ${blockquoteBg} !important;
        padding: 8px 16px !important;
        margin: 16px 0 !important;
        color: ${text} !important;
      }
      .epub-content-container hr {
        border: 0 !important;
        border-top: 1px solid ${border} !important;
      }
      .epub-content-container img {
        max-width: 100% !important;
        height: auto !important;
        border-radius: 4px;
      }
    `;
  }, [settings.theme, settings.fontSize, settings.lineHeight, settings.lineWidth, settings.fontFamily]);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: injectedThemeCss }} />
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        onClick={handleContainerClick}
        onDoubleClick={handleDoubleClick}
        onMouseUp={handleSelection}
        onTouchEnd={handleSelection}
        className="epub-themed-scroll"
        style={{
          flex: 1,
          width: '100%',
          height: '100%',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          padding: '24px 20px calc(40px + var(--safe-bottom)) 20px',
        }}
      >
        <div
          ref={contentContainerRef}
          onDoubleClick={handleDoubleClick}
          className="epub-content-container"
          style={{
            userSelect: 'text',
          }}
          dangerouslySetInnerHTML={{ __html: highlightedContent }}
        />

        {parsed && currentChapter < parsed.totalChapters && (
          <div
            style={{
              maxWidth: settings.lineWidth || 680,
              margin: '40px auto 20px auto',
              padding: '24px 20px',
              borderRadius: 14,
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <div style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>
              ✦ Chapter {currentChapter} Complete
            </div>
            <button
              className="primary-btn"
              onClick={(e) => {
                e.stopPropagation();
                onChapterChange(currentChapter + 1, 0);
              }}
              style={{ padding: '10px 24px', fontSize: 14 }}
            >
              <span>Next Chapter</span>
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>

      {selectedQuote && (
        <MarkDialog
          quote={selectedQuote}
          onSave={handleSaveMark}
          onLookupVocab={(cleanWord) => {
            setSelectedQuote(null);
            window.getSelection()?.removeAllRanges();
            onLookupWord?.(cleanWord);
          }}
          onClose={() => {
            setSelectedQuote(null);
            window.getSelection()?.removeAllRanges();
          }}
        />
      )}
    </>
  );
};
