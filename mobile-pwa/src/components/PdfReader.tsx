import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { ReaderSettings } from '../types';
import { loadPdfDocument, renderPdfPage, type PdfDoc } from '../services/pdfService';
import { PasswordModal } from './PasswordModal';
import { Loader2 } from 'lucide-react';

interface PdfReaderProps {
  blob: Blob;
  currentPage: number;
  totalPages: number;
  settings: ReaderSettings;
  zoomMultiplier: number;
  onPageCountLoaded: (count: number) => void;
  onPageChange: (page: number) => void;
  onToggleControls: () => void;
  onError: (err: string) => void;
}

export const PdfReader: React.FC<PdfReaderProps> = ({
  blob,
  currentPage,
  settings,
  zoomMultiplier,
  onPageCountLoaded,
  onPageChange,
  onToggleControls,
  onError,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Load PDF Document
  const initPdf = useCallback(
    async (password?: string) => {
      try {
        const loadedDoc = await loadPdfDocument(blob, password);
        setDoc(loadedDoc);
        setNeedsPassword(false);
        setPasswordError(null);
        onPageCountLoaded(loadedDoc.numPages);
      } catch (err: any) {
        if (err?.name === 'PasswordException') {
          setNeedsPassword(true);
          if (password) {
            setPasswordError('Incorrect password. Please try again.');
          }
        } else {
          onError(err?.message || 'Failed to open PDF document.');
        }
      }
    },
    [blob, onPageCountLoaded, onError]
  );

  useEffect(() => {
    initPdf();
  }, [initPdf]);

  // Render active page
  useEffect(() => {
    if (!doc || !canvasRef.current || !containerRef.current) return;

    let isCancelled = false;
    setIsRendering(true);

    const render = async () => {
      try {
        const containerWidth = containerRef.current?.clientWidth || window.innerWidth;
        await renderPdfPage(
          doc,
          currentPage,
          canvasRef.current!,
          containerWidth,
          settings.pdfFitMode,
          zoomMultiplier
        );
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.error('PDF Page render error:', err);
        }
      } finally {
        if (!isCancelled) {
          setIsRendering(false);
        }
      }
    };

    render();

    return () => {
      isCancelled = true;
    };
  }, [doc, currentPage, settings.pdfFitMode, zoomMultiplier]);

  // Handle tap navigation
  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // If zoomed in, panning is preferred over tap navigation
    if (zoomMultiplier > 1.2) {
      onToggleControls();
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;

    if (settings.tapToTurn) {
      if (clickX < width * 0.25) {
        // Left zone: Previous page
        if (currentPage > 1) onPageChange(currentPage - 1);
        return;
      }
      if (clickX > width * 0.75) {
        // Right zone: Next page
        if (doc && currentPage < doc.numPages) onPageChange(currentPage + 1);
        return;
      }
    }

    // Center zone: Toggle controls overlay
    onToggleControls();
  };

  // Determine filter class based on settings
  let filterClass = '';
  if (settings.pdfPageFilter === 'warm') {
    filterClass = 'pdf-filter-warm';
  } else if (settings.pdfPageFilter === 'night') {
    filterClass = 'pdf-filter-night';
  }

  return (
    <div
      ref={containerRef}
      onClick={handleContainerClick}
      style={{
        flex: 1,
        width: '100%',
        height: '100%',
        overflow: 'auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        backgroundColor: 'var(--bg-main)',
        WebkitOverflowScrolling: 'touch',
        touchAction: zoomMultiplier > 1.05 ? 'pan-x pan-y' : 'manipulation',
      }}
    >
      {/* Canvas container */}
      <div
        style={{
          margin: 'auto',
          padding: '12px 8px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          position: 'relative',
        }}
      >
        <canvas
          ref={canvasRef}
          className={filterClass}
          style={{
            display: 'block',
            maxWidth: zoomMultiplier <= 1.0 ? '100%' : 'none',
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.45)',
            borderRadius: 4,
            transition: 'filter 0.2s ease',
          }}
        />

        {isRendering && (
          <div
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              padding: '6px 10px',
              borderRadius: 8,
              backgroundColor: 'rgba(20, 18, 16, 0.75)',
              backdropFilter: 'blur(4px)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              color: 'var(--accent-gold)',
              fontSize: 12,
              zIndex: 10,
            }}
          >
            <Loader2 size={14} className="spin-slow" />
            <span>Rendering...</span>
          </div>
        )}
      </div>

      {/* Password Modal if encrypted */}
      {needsPassword && (
        <PasswordModal
          onSubmit={(pwd) => initPdf(pwd)}
          onCancel={() => onError('Password required to view document')}
          error={passwordError}
        />
      )}
    </div>
  );
};
