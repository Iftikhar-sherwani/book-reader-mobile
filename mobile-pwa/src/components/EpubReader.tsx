import React, { useEffect, useState, useRef, useCallback } from 'react';
import type { ReaderSettings } from '../types';
import { parseEpub, type ParsedEpub } from '../services/epubService';
import { Loader2 } from 'lucide-react';

interface EpubReaderProps {
  blob: Blob;
  currentChapter: number;
  initialScrollOffset: number;
  settings: ReaderSettings;
  onPageCountLoaded: (count: number) => void;
  onChapterChange: (chapterIndex: number, scrollOffset: number) => void;
  onToggleControls: () => void;
  onError: (err: string) => void;
}

export const EpubReader: React.FC<EpubReaderProps> = ({
  blob,
  currentChapter,
  initialScrollOffset,
  settings,
  onPageCountLoaded,
  onChapterChange,
  onToggleControls,
  onError,
}) => {
  const [parsed, setParsed] = useState<ParsedEpub | null>(null);
  const [loading, setLoading] = useState(true);
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

  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
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
  const chapter = parsed.chapters[activeChapterIndex];

  return (
    <div
      ref={scrollContainerRef}
      onScroll={handleScroll}
      onClick={handleContainerClick}
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
        dangerouslySetInnerHTML={{ __html: chapter.content }}
      />
    </div>
  );
};
