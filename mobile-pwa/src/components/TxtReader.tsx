import React, { useEffect, useState, useRef } from 'react';
import type { ReaderSettings } from '../types';
import { parseTxt, type ParsedTxt } from '../services/txtService';
import { Loader2 } from 'lucide-react';

interface TxtReaderProps {
  blob: Blob;
  bookTitle: string;
  currentPage: number;
  settings: ReaderSettings;
  onPageCountLoaded: (count: number) => void;
  onPageChange: (page: number) => void;
  onToggleControls: () => void;
  onError: (err: string) => void;
}

export const TxtReader: React.FC<TxtReaderProps> = ({
  blob,
  bookTitle,
  currentPage,
  settings,
  onPageCountLoaded,
  onPageChange,
  onToggleControls,
  onError,
}) => {
  const [parsed, setParsed] = useState<ParsedTxt | null>(null);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        setLoading(true);
        const res = await parseTxt(blob, bookTitle);
        if (mounted) {
          setParsed(res);
          onPageCountLoaded(res.totalPageCount);
          setLoading(false);
        }
      } catch (err: any) {
        if (mounted) {
          onError(err?.message || 'Failed to read plain text file.');
          setLoading(false);
        }
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [blob, bookTitle, onPageCountLoaded, onError]);

  // Reset scroll when page changes
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [currentPage]);

  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;

    if (settings.tapToTurn) {
      if (clickX < width * 0.25) {
        if (currentPage > 1) onPageChange(currentPage - 1);
        return;
      }
      if (clickX > width * 0.75) {
        if (parsed && currentPage < parsed.totalPageCount) onPageChange(currentPage + 1);
        return;
      }
    }

    onToggleControls();
  };

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-gold)' }}>
        <Loader2 size={32} className="spin-slow" />
        <span style={{ marginLeft: 10 }}>Loading text...</span>
      </div>
    );
  }

  if (!parsed) return null;

  const pageIndex = Math.max(0, Math.min(currentPage - 1, parsed.pages.length - 1));
  const pageText = parsed.pages[pageIndex] || '';

  return (
    <div
      ref={scrollRef}
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
        style={{
          maxWidth: 680,
          margin: '0 auto',
          fontSize: `${settings.fontSize}px`,
          lineHeight: settings.lineHeight,
          fontFamily: settings.fontFamily === 'serif' ? 'var(--font-serif)' : 'var(--font-ui)',
          color: 'var(--text-primary)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          userSelect: 'text',
        }}
      >
        {pageText}
      </div>
    </div>
  );
};
