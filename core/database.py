import sqlite3
from pathlib import Path

import db
from core.models import Book, Bookmark, Highlight, ReadingProgress, SavedWord

DB_PATH = db.DB_PATH


def get_connection() -> sqlite3.Connection:
    return db.get_connection()


def init_db() -> None:
    db.init_db()


def add_book(book: Book) -> None:
    db.insert_book_if_new(book.file_path, book.title, book.format)


def get_all_books() -> list[Book]:
    rows = db.get_all_books()
    return [
        Book(
            id=r["id"],
            title=r["title"],
            author="",
            file_path=r["path"],
            format=r["fmt"],
        )
        for r in rows
    ]


def get_book(book_id: str) -> Book | None:
    r = db.get_book(book_id)
    if not r:
        return None
    return Book(
        id=r["id"],
        title=r["title"],
        author="",
        file_path=r["path"],
        format=r["fmt"],
    )


def save_progress(progress: ReadingProgress) -> None:
    db.save_last_loc(progress.book_id, str(progress.scroll_offset))


def get_progress(book_id: str) -> ReadingProgress | None:
    loc = db.get_last_loc(book_id)
    if loc is not None and loc != "":
        try:
            offset = int(loc)
        except ValueError:
            offset = 0
        return ReadingProgress(book_id=book_id, location=loc, scroll_offset=offset)
    return None


def add_highlight(highlight: Highlight) -> int:
    with get_connection() as conn:
        cursor = conn.execute(
            """
            INSERT INTO highlights (book_id, start_pos, end_pos, color, text, page_index)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                highlight.book_id,
                highlight.start_pos,
                highlight.end_pos,
                highlight.color,
                highlight.text,
                highlight.page_index,
            ),
        )
        return cursor.lastrowid


def get_highlights(book_id: str) -> list[Highlight]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT id, book_id, start_pos, end_pos, color, text, page_index
            FROM highlights WHERE book_id = ? ORDER BY page_index, start_pos
            """,
            (book_id,),
        ).fetchall()
    return [Highlight(**dict(row)) for row in rows]


def delete_highlight(highlight_id: int) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM highlights WHERE id = ?", (highlight_id,))


def add_saved_word(word: SavedWord) -> int:
    with get_connection() as conn:
        cursor = conn.execute(
            """
            INSERT INTO saved_words (book_id, word, context, note)
            VALUES (?, ?, ?, ?)
            """,
            (word.book_id, word.word, word.context, word.note),
        )
        return cursor.lastrowid


def get_saved_words(book_id: str | None = None) -> list[SavedWord]:
    with get_connection() as conn:
        if book_id:
            rows = conn.execute(
                """
                SELECT id, book_id, word, context, note
                FROM saved_words WHERE book_id = ? ORDER BY created_at DESC
                """,
                (book_id,),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT id, book_id, word, context, note
                FROM saved_words ORDER BY created_at DESC
                """
            ).fetchall()
    return [SavedWord(**dict(row)) for row in rows]


def delete_saved_word(word_id: int) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM saved_words WHERE id = ?", (word_id,))


def add_bookmark(bookmark: Bookmark) -> int:
    with get_connection() as conn:
        cursor = conn.execute(
            """
            INSERT INTO bookmarks (book_id, page_index, scroll_offset, title)
            VALUES (?, ?, ?, ?)
            """,
            (bookmark.book_id, bookmark.page_index, bookmark.scroll_offset, bookmark.title),
        )
        return cursor.lastrowid


def get_bookmarks(book_id: str) -> list[Bookmark]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT id, book_id, page_index, scroll_offset, title, created_at
            FROM bookmarks WHERE book_id = ? ORDER BY page_index, scroll_offset
            """,
            (book_id,),
        ).fetchall()
    return [Bookmark(**dict(row)) for row in rows]


def get_latest_bookmark(book_id: str) -> Bookmark | None:
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT id, book_id, page_index, scroll_offset, title, created_at
            FROM bookmarks WHERE book_id = ? ORDER BY id DESC LIMIT 1
            """,
            (book_id,),
        ).fetchone()
    return Bookmark(**dict(row)) if row else None


def delete_bookmark(bookmark_id: int) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM bookmarks WHERE id = ?", (bookmark_id,))

