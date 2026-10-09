"""Marks exporter — write book marks to Markdown files.

Exports the marks table for one or all books as human-readable .md files.
Format:
    # Book Title
    *Author Name*  (if available)

    ---

    > quoted text here
    📝 My note here
    `[Chapter 3 | EPUB]`  or  `[Page 12 | PDF]`

    ---

    > another quote ...
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import TYPE_CHECKING

import db

if TYPE_CHECKING:
    from core.models import Book


# ── Helpers ───────────────────────────────────────────────────────────

def _parse_loc(loc: str) -> tuple[int, float]:
    """Parse a loc string.  Supports 'chapter|scroll' (EPUB) and plain ints (PDF/TXT)."""
    if not loc:
        return 0, 0.0
    if "|" in loc:
        try:
            parts = loc.split("|", 1)
            return int(parts[0]), float(parts[1])
        except (ValueError, TypeError):
            return 0, 0.0
    try:
        return int(loc), 0.0
    except (ValueError, TypeError):
        return 0, 0.0


def _loc_label(loc: str, book_format: str) -> str:
    """Return a human-readable location label like '[Chapter 3 | EPUB]'."""
    idx, _ = _parse_loc(loc)
    if book_format == "epub":
        return f"[Chapter {idx + 1} | EPUB]"
    elif book_format == "pdf":
        return f"[Page {idx + 1} | PDF]"
    else:
        return f"[Position {idx} | TXT]"


def _color_label(color: str) -> str:
    return {
        "#FFF3B0": "🟡 Yellow",
        "#B8E6C8": "🟢 Green",
        "#B3D4FC": "🔵 Blue",
        "#F8BBD0": "🩷 Pink",
    }.get(color, "")


def _render_book_md(book: "Book", marks: list[dict]) -> str:
    """Render the full Markdown content for one book."""
    lines: list[str] = []

    # ── Title block ───────────────────────────────────────────────────
    lines.append(f"# {book.title}")
    if getattr(book, "author", ""):
        lines.append(f"*{book.author}*")
    lines.append("")
    lines.append(
        f"*Exported {datetime.now().strftime('%Y-%m-%d %H:%M')} · {len(marks)} mark{'s' if len(marks) != 1 else ''}*"
    )
    lines.append("")
    lines.append("---")
    lines.append("")

    if not marks:
        lines.append("*No marks saved for this book.*")
        return "\n".join(lines)

    # ── Sort marks by loc (reading order) ────────────────────────────
    def sort_key(m: dict):
        idx, scroll = _parse_loc(m.get("loc", ""))
        return (idx, scroll)

    sorted_marks = sorted(marks, key=sort_key)

    for m in sorted_marks:
        quote = (m.get("quote") or "").strip()
        note  = (m.get("note")  or "").strip()
        color = m.get("color", "")
        loc   = m.get("loc", "")

        if not quote:
            continue

        # Quote block — indent multi-line quotes properly
        for ql in quote.splitlines():
            lines.append(f"> {ql}")

        if note:
            lines.append(f"📝 {note}")

        loc_str = _loc_label(loc, book.format)
        color_str = _color_label(color)
        meta_parts = [loc_str]
        if color_str:
            meta_parts.append(color_str)
        lines.append("`" + "  ·  ".join(meta_parts) + "`")

        lines.append("")
        lines.append("---")
        lines.append("")

    return "\n".join(lines)


# ── Public API ────────────────────────────────────────────────────────

def export_book_marks(book: "Book", output_path: str | Path) -> int:
    """Write marks for a single book to output_path.  Returns the number of marks exported."""
    marks = db.get_marks(book.id)
    content = _render_book_md(book, marks)
    Path(output_path).write_text(content, encoding="utf-8")
    return len(marks)


def export_all_books_marks(output_dir: str | Path) -> dict[str, int]:
    """Write one .md file per book into output_dir.

    Returns a dict mapping book title → mark count.
    """
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    results: dict[str, int] = {}
    all_books_raw = db.get_all_books()

    for raw in all_books_raw:
        from core.models import Book

        book = Book(
            id=raw["id"],
            title=raw.get("title", "Untitled"),
            author="",
            file_path=raw.get("path", ""),
            format=raw.get("fmt", ""),
        )
        marks = db.get_marks(book.id)
        if not marks:
            # Still write the file but skip if truly empty
            continue

        # Build a safe filename
        safe = "".join(c for c in book.title if c.isalnum() or c in " _-").strip()
        safe = safe[:80] or book.id[:16]
        file_path = out / f"{safe}_marks.md"

        # Handle name collisions
        stem, suffix, counter = file_path.stem, file_path.suffix, 1
        while file_path.exists():
            file_path = out / f"{stem}_{counter}{suffix}"
            counter += 1

        content = _render_book_md(book, marks)
        file_path.write_text(content, encoding="utf-8")
        results[book.title] = len(marks)

    return results
