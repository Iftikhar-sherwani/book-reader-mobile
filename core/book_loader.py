import hashlib
from pathlib import Path

import fitz
from bs4 import BeautifulSoup
from ebooklib import ITEM_DOCUMENT, epub

import db
from core.models import Book


def book_id_from_path(file_path: str) -> str:
    return db.book_id(file_path)


def load_txt(file_path: str) -> tuple[Book, str]:
    path = Path(file_path)
    text = path.read_text(encoding="utf-8", errors="replace")
    book = Book(
        id=book_id_from_path(file_path),
        title=path.stem,
        author="",
        file_path=str(path.resolve()),
        format="txt",
    )
    return book, text


def load_epub_chapters(file_path: str) -> tuple[Book, list[str]]:
    """Load EPUB and return (Book, list-of-chapter-HTML-strings)."""
    path = Path(file_path)
    ebook = epub.read_epub(str(path))

    title = ebook.get_metadata("DC", "title")
    author = ebook.get_metadata("DC", "creator")
    book_title = title[0][0] if title else path.stem
    book_author = author[0][0] if author else ""

    parts: list[str] = []
    # Use get_items_of_type for more reliable document retrieval
    for item in ebook.get_items_of_type(ITEM_DOCUMENT):
        try:
            raw = item.get_content()
            soup = BeautifulSoup(raw, "lxml")
            for tag in soup(["script", "style"]):
                tag.decompose()
            body = soup.body
            if body:
                # Get the inner HTML of the body
                inner = "".join(str(child) for child in body.children)
                if inner.strip():
                    parts.append(inner)
            elif soup.get_text(strip=True):
                parts.append(str(soup))
        except Exception:
            # Skip items that can't be parsed
            continue

    # Also try the spine order for more complete extraction
    if not parts:
        for item_id, _ in ebook.spine:
            item = ebook.get_item_with_id(item_id)
            if item is None:
                continue
            try:
                raw = item.get_content()
                soup = BeautifulSoup(raw, "lxml")
                for tag in soup(["script", "style"]):
                    tag.decompose()
                body = soup.body
                if body:
                    inner = "".join(str(child) for child in body.children)
                    if inner.strip():
                        parts.append(inner)
                elif soup.get_text(strip=True):
                    parts.append(str(soup))
            except Exception:
                continue

    if not parts:
        parts = ["<p>No readable content found.</p>"]

    book = Book(
        id=book_id_from_path(file_path),
        title=book_title,
        author=book_author,
        file_path=str(path.resolve()),
        format="epub",
    )
    return book, parts


def load_epub(file_path: str) -> tuple[Book, str]:
    """Load EPUB — returns concatenated HTML for backward compatibility."""
    book, chapters = load_epub_chapters(file_path)
    html = "<hr/>".join(chapters)
    return book, html


def _is_junk_page(text: str) -> bool:
    """Check if a page contains only watermarks, URLs, or trivially short junk."""
    stripped = text.strip()
    if not stripped:
        return True
    # Common watermark / source-site patterns
    junk_patterns = [
        "oceanofpdf", "ocean of pdf", "manybooks", "gutenberg",
        "libgen", "z-lib", "zlibrary", "bookfi", "b-ok.org",
    ]
    lower = stripped.lower().replace(" ", "")
    # If the entire page text (ignoring whitespace) is just a known watermark
    for pattern in junk_patterns:
        if lower.replace(".", "").replace("/", "").replace(":", "") == pattern.replace(".", ""):
            return True
    # If the page has very little real text (less than 30 chars after stripping)
    # AND it looks like a URL or watermark
    if len(stripped) < 40:
        low = stripped.lower()
        if any(p in low for p in junk_patterns):
            return True
        # Pure URL pages
        if low.startswith("http") or low.startswith("www."):
            return True
    return False


def load_pdf(file_path: str) -> tuple[Book, str]:
    path = Path(file_path)
    doc = fitz.open(str(path))
    meta = doc.metadata or {}
    title = (meta.get("title") or "").strip() or path.stem
    author = (meta.get("author") or "").strip()
    doc.close()

    book = Book(
        id=book_id_from_path(file_path),
        title=title,
        author=author,
        file_path=str(path.resolve()),
        format="pdf",
    )
    return book, str(path.resolve())


def load_book(file_path: str) -> tuple[Book, str]:
    suffix = Path(file_path).suffix.lower()
    if suffix == ".txt":
        return load_txt(file_path)
    if suffix == ".epub":
        return load_epub(file_path)
    if suffix == ".pdf":
        return load_pdf(file_path)
    raise ValueError(f"Unsupported format: {suffix}")
