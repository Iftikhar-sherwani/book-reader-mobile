import type { Book } from '../types';
import { isBookIndexed, indexBookPages } from './db';
import { loadPdfDocument } from './pdfService';
import { parseEpub } from './epubService';
import { parseTxt } from './txtService';

export interface IndexerCallbacks {
  onProgress?: (current: number, total: number) => void;
  onWarning?: (msg: string) => void;
  onComplete?: () => void;
}

/**
 * Extracts and indexes text for PDF, EPUB, and TXT books in the background.
 * Detects scanned PDFs without selectable text and emits a warning.
 */
export async function indexBook(
  book: Book,
  blob: Blob,
  callbacks?: IndexerCallbacks
): Promise<void> {
  try {
    const alreadyIndexed = await isBookIndexed(book.id);
    if (alreadyIndexed) {
      callbacks?.onComplete?.();
      return;
    }

    const pagesToIndex: { loc: string; text: string }[] = [];
    let hasAnyText = false;

    if (book.format === 'pdf') {
      const doc = await loadPdfDocument(blob);
      const totalPages = doc.numPages;

      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        try {
          const page = await doc.getPage(pageNum);
          const textContent = await page.getTextContent();
          const pageText = textContent.items
            .map((item: any) => ('str' in item ? item.str : ''))
            .join(' ')
            .trim();

          if (pageText.length > 0) {
            hasAnyText = true;
          }

          pagesToIndex.push({
            loc: String(pageNum),
            text: pageText,
          });
        } catch {
          // Continue indexing next pages
        }

        callbacks?.onProgress?.(pageNum, totalPages);
        // Yield momentarily to main thread so UI stays responsive on mobile
        if (pageNum % 5 === 0) {
          await new Promise((r) => setTimeout(r, 0));
        }
      }

      if (!hasAnyText && totalPages > 0) {
        callbacks?.onWarning?.('This book looks scanned. Search will not work on it.');
      }
    } else if (book.format === 'epub') {
      const parsed = await parseEpub(blob);
      const totalChapters = parsed.chapters.length;

      for (let i = 0; i < totalChapters; i++) {
        const chapter = parsed.chapters[i];
        const parser = new DOMParser();
        const doc = parser.parseFromString(chapter.content, 'text/html');
        const text = doc.body.textContent?.trim() || '';

        if (text.length > 0) {
          hasAnyText = true;
        }

        pagesToIndex.push({
          loc: String(i + 1),
          text,
        });

        callbacks?.onProgress?.(i + 1, totalChapters);
        if (i % 5 === 0) {
          await new Promise((r) => setTimeout(r, 0));
        }
      }
    } else if (book.format === 'txt') {
      const parsed = await parseTxt(blob, book.title);
      const totalPages = parsed.pages.length;

      for (let p = 0; p < totalPages; p++) {
        const pageText = parsed.pages[p];
        if (pageText.trim()) hasAnyText = true;
        pagesToIndex.push({
          loc: String(p + 1),
          text: pageText,
        });
        callbacks?.onProgress?.(p + 1, totalPages);
      }
    }

    await indexBookPages(book.id, pagesToIndex);
    callbacks?.onComplete?.();
  } catch (err) {
    console.warn('Background indexing encountered an error:', err);
  }
}
