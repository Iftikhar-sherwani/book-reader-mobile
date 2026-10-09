"""Book indexer — extracts text into the FTS5 pages table in a background QThread.

Supports:
  - PDF:  one index entry per page  (loc = str(page_number))
  - EPUB: one index entry per chapter (loc = str(chapter_index))
  - TXT:  one index entry per chunk  (loc = str(chunk_index))

Emits:
  progress(int, int)        — current, total
  page_indexed(str, str)    — book_id, loc
  finished(bool, str)       — success, message
  no_text_warning()         — emitted if no extractable text was found
"""

from __future__ import annotations

import re
from pathlib import Path

from PyQt6.QtCore import QThread, pyqtSignal

import db


class IndexWorker(QThread):
    """Background thread that extracts and indexes book text."""

    progress = pyqtSignal(int, int)          # current_step, total_steps
    finished = pyqtSignal(bool, str)         # success, message
    no_text_warning = pyqtSignal()           # emitted when < 5% pages have text

    # Minimum average characters per page to consider the book text-bearing
    _MIN_AVG_CHARS = 30

    def __init__(
        self,
        book_id: str,
        file_path: str,
        book_format: str,
        epub_chapters: list[str] | None = None,
        parent=None,
    ):
        super().__init__(parent)
        self.book_id = book_id
        self.file_path = file_path
        self.book_format = book_format
        self.epub_chapters = epub_chapters or []
        self._abort = False

    def abort(self) -> None:
        self._abort = True

    # ── Main entry point ──────────────────────────────────────────────

    def run(self) -> None:
        try:
            if self.book_format == "pdf":
                self._index_pdf()
            elif self.book_format == "epub":
                self._index_epub()
            else:
                self._index_txt()
        except Exception as exc:
            self.finished.emit(False, str(exc))

    # ── PDF ───────────────────────────────────────────────────────────

    def _index_pdf(self) -> None:
        import fitz  # PyMuPDF

        try:
            doc = fitz.open(self.file_path)
        except Exception as exc:
            self.finished.emit(False, f"Cannot open PDF: {exc}")
            return

        total = len(doc)
        pages: list[tuple[str, str]] = []
        total_chars = 0

        for i in range(total):
            if self._abort:
                doc.close()
                self.finished.emit(False, "Aborted")
                return
            try:
                page = doc.load_page(i)
                text = page.get_text("text").strip()
            except Exception:
                text = ""
            total_chars += len(text)
            if text:
                pages.append((str(i), text))
            self.progress.emit(i + 1, total)

        doc.close()
        self._commit(pages, total, total_chars)

    # ── EPUB ──────────────────────────────────────────────────────────

    def _index_epub(self) -> None:
        chapters = self.epub_chapters
        if not chapters:
            # Fall back: re-parse from file
            try:
                from core.book_loader import load_epub_chapters
                _, chapters = load_epub_chapters(self.file_path)
            except Exception as exc:
                self.finished.emit(False, f"Cannot load EPUB: {exc}")
                return

        total = len(chapters)
        pages: list[tuple[str, str]] = []
        total_chars = 0

        try:
            from bs4 import BeautifulSoup
        except ImportError:
            BeautifulSoup = None

        for i, html in enumerate(chapters):
            if self._abort:
                self.finished.emit(False, "Aborted")
                return

            # Strip HTML tags
            if BeautifulSoup:
                try:
                    text = BeautifulSoup(html, "lxml").get_text(" ", strip=True)
                except Exception:
                    text = _strip_tags(html)
            else:
                text = _strip_tags(html)

            text = text.strip()
            total_chars += len(text)
            if text:
                pages.append((str(i), text))
            self.progress.emit(i + 1, total)

        self._commit(pages, total, total_chars)

    # ── TXT ───────────────────────────────────────────────────────────

    def _index_txt(self) -> None:
        try:
            content = Path(self.file_path).read_text(encoding="utf-8", errors="replace")
        except Exception as exc:
            self.finished.emit(False, f"Cannot read file: {exc}")
            return

        # Split into chunks of ~3 000 chars at paragraph boundaries
        chunks = _chunk_text(content, chunk_size=3000)
        total = len(chunks)
        pages: list[tuple[str, str]] = []
        total_chars = len(content)

        for i, chunk in enumerate(chunks):
            if self._abort:
                self.finished.emit(False, "Aborted")
                return
            text = chunk.strip()
            if text:
                pages.append((str(i), text))
            self.progress.emit(i + 1, total)

        self._commit(pages, total, total_chars)

    # ── Helpers ───────────────────────────────────────────────────────

    def _commit(self, pages: list[tuple[str, str]], total: int, total_chars: int) -> None:
        """Bulk-write pages to DB and fire appropriate finished signal."""
        db.index_book_pages_bulk(self.book_id, pages)

        avg = total_chars / max(total, 1)
        if avg < self._MIN_AVG_CHARS:
            self.no_text_warning.emit()

        msg = f"Indexed {len(pages)} section{'s' if len(pages) != 1 else ''}"
        self.finished.emit(True, msg)


# ── Utilities ─────────────────────────────────────────────────────────

_TAG_RE = re.compile(r"<[^>]+>")

def _strip_tags(html: str) -> str:
    return _TAG_RE.sub(" ", html)


def _chunk_text(text: str, chunk_size: int = 3000) -> list[str]:
    """Split text on paragraph breaks into chunks of approximately chunk_size chars."""
    paragraphs = text.split("\n\n")
    chunks: list[str] = []
    current = ""
    for para in paragraphs:
        if current and len(current) + len(para) + 2 > chunk_size:
            chunks.append(current)
            current = para
        else:
            current = (current + "\n\n" + para) if current else para
    if current.strip():
        chunks.append(current)
    return chunks or [""]
