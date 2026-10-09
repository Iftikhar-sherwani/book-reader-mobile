import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import type { ReaderSettings, Mark } from '../types';
import { parseEpub, type ParsedEpub } from '../services/epubService';
import { MarkDialog } from './MarkDialog';
import { Loader2 } from 'lucide-react';

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
}) => {
  const [parsed, setParsed] = useState<ParsedEpub | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedQuote, setSelectedQuote] = useState<string | null>(null);
  const [savedScrollY, setSavedScrollY] = useState<number>(0);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const contentContainerRef = useRef<HTMLDivElement>(null);

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
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const text = sel.toString().trim();
    if (text.length >= 2) {
      const scrollY = scrollContainerRef.current?.scrollTop || 0;
      setSavedScrollY(scrollY);
      setSelectedQuote(text);
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

  return (
    <>
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        onClick={handleContainerClick}
        onMouseUp={handleSelection}
        onTouchEnd={handleSelection}
        style={{
          flex: 1,
          width: '100%',
          height: '100%',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          backgroundColor: 'var(--bg-main)',
          padding: '24px 20px calc(40px + var(--safe-bottom)) 20px',
        }}
      >
        <div
          ref={contentContainerRef}
          style={{
            maxWidth: 680,
            margin: '0 auto',
            fontSize: `${settings.fontSize}px`,
            lineHeight: settings.lineHeight,
            fontFamily: settings.fontFamily === 'serif' ? 'var(--font-serif)' : 'var(--font-ui)',
            color: 'var(--text-primary)',
            userSelect: 'text',
          }}
          dangerouslySetInnerHTML={{ __html: highlightedContent }}
        />
      </div>

      {selectedQuote && (
        <MarkDialog
          quote={selectedQuote}
          onSave={handleSaveMark}
          onClose={() => {
            setSelectedQuote(null);
            window.getSelection()?.removeAllRanges();
          }}
        />
      )}
    </>
  );
};
