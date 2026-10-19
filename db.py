"""Database foundation module for Book Reader.

Handles SQLite storage in reader.db for:
- books: book metadata, file path, format, last reading location, and timestamps
- marks: bookmarks, highlights, and annotations
"""

import hashlib
import json
import math
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta
from pathlib import Path

DB_PATH = Path(os.environ.get("READER_DB_PATH", Path(__file__).resolve().parent / "reader.db"))


def get_connection(db_path: Path | str | None = None) -> sqlite3.Connection:
    target_path = Path(db_path) if db_path else DB_PATH
    target_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(target_path)
    conn.row_factory = sqlite3.Row
    return conn


@contextmanager
def get_db(db_path: Path | str | None = None):
    """Context manager for SQLite connections that commits and closes cleanly."""
    conn = get_connection(db_path)
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def book_id(path: str | Path) -> str:
    """Hash the first 1 MB of the file plus its file size; return the first 16 hex characters.

    Renaming a file does not alter this hash because it depends only on file contents and size.
    """
    p = Path(path)
    if not p.is_file():
        raise FileNotFoundError(f"File not found: {path}")
    size = p.stat().st_size
    hasher = hashlib.sha256()
    with open(p, "rb") as f:
        chunk = f.read(1024 * 1024)
        hasher.update(chunk)
    hasher.update(str(size).encode("utf-8"))
    return hasher.hexdigest()[:16]


def init_db(db_path: Path | str | None = None) -> None:
    """Open reader.db and create required tables if missing.

    Also imports old last-page saves once if present.
    """
    target_path = Path(db_path) if db_path else DB_PATH
    with get_db(target_path) as conn:
        cursor = conn.cursor()

        # Check existing books table schema in case it was created under old schema
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='books'")
        if cursor.fetchone():
            cursor.execute("PRAGMA table_info(books)")
            cols = {row["name"] for row in cursor.fetchall()}
            required_cols = {"id", "path", "title", "fmt", "last_loc", "last_read", "added"}
            if not required_cols.issubset(cols):
                _migrate_old_books_table(conn)

        # Create books table if missing
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS books (
                id TEXT PRIMARY KEY,
                path TEXT,
                title TEXT,
                fmt TEXT,
                last_loc TEXT,
                last_read TEXT,
                added TEXT
            )
            """
        )

        # Create marks table if missing
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS marks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                book_id TEXT,
                loc TEXT,
                quote TEXT,
                note TEXT,
                color TEXT,
                created TEXT
            )
            """
        )

        # Reviews table for spaced repetition
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS reviews (
                mark_id INTEGER PRIMARY KEY,
                due TEXT,
                interval_days INTEGER
            )
            """
        )

        # Actions table for chapter action steps
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS actions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                book_id TEXT,
                loc TEXT,
                text TEXT,
                created TEXT,
                done INTEGER DEFAULT 0
            )
            """
        )

        # Vocab table for saved dictionary words
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS vocab (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                word TEXT NOT NULL,
                definition TEXT,
                book TEXT,
                date TEXT
            )
            """
        )

        # Sessions table for reading time tracking
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                book_id TEXT,
                start TEXT,
                seconds INTEGER
            )
            """
        )

        # Backwards compatibility tables for existing highlights, bookmarks, saved_words
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS highlights (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                book_id TEXT NOT NULL,
                start_pos INTEGER NOT NULL,
                end_pos INTEGER NOT NULL,
                color TEXT DEFAULT '#FFEB3B',
                text TEXT NOT NULL,
                page_index INTEGER DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS saved_words (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                book_id TEXT NOT NULL,
                word TEXT NOT NULL,
                context TEXT DEFAULT '',
                note TEXT DEFAULT '',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS bookmarks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                book_id TEXT NOT NULL,
                page_index INTEGER NOT NULL,
                scroll_offset INTEGER DEFAULT 0,
                title TEXT DEFAULT '',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            """
        )

        # Check user_version for one-time legacy import
        cursor.execute("PRAGMA user_version")
        ver = cursor.fetchone()[0]
        if ver == 0:
            _import_legacy_saves(conn, target_path)
            conn.execute("PRAGMA user_version = 1")

        # Migration v1 -> v2: create FTS5 pages table
        cursor.execute("PRAGMA user_version")
        ver = cursor.fetchone()[0]
        if ver < 2:
            conn.executescript(
                """
                CREATE VIRTUAL TABLE IF NOT EXISTS pages
                USING fts5(
                    book_id UNINDEXED,
                    loc UNINDEXED,
                    text,
                    tokenize = 'unicode61'
                );
                """
            )
            conn.execute("PRAGMA user_version = 2")


def _migrate_old_books_table(conn: sqlite3.Connection) -> None:
    """Migrate a pre-existing books table from the old schema to the new schema."""
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='reading_progress'")
    has_progress = cursor.fetchone() is not None

    progress_map: dict[str, str] = {}
    if has_progress:
        for row in conn.execute("SELECT book_id, scroll_offset FROM reading_progress").fetchall():
            progress_map[row["book_id"]] = str(row["scroll_offset"])

    cursor.execute("PRAGMA table_info(books)")
    cols = {row["name"] for row in cursor.fetchall()}
    rows = conn.execute("SELECT * FROM books").fetchall()

    conn.execute("ALTER TABLE books RENAME TO _books_old")
    conn.execute(
        """
        CREATE TABLE books (
            id TEXT PRIMARY KEY,
            path TEXT,
            title TEXT,
            fmt TEXT,
            last_loc TEXT,
            last_read TEXT,
            added TEXT
        )
        """
    )

    for r in rows:
        old_id = r["id"]
        old_path = r["file_path"] if "file_path" in cols else r["path"]
        old_title = r["title"] if "title" in cols else ""
        old_fmt = r["format"] if "format" in cols else (r["fmt"] if "fmt" in cols else "")
        old_added = r["added_at"] if "added_at" in cols else (r["added"] if "added" in cols else datetime.now().isoformat())
        old_loc = progress_map.get(old_id, "")

        new_id = old_id
        if old_path and Path(old_path).is_file():
            try:
                new_id = book_id(old_path)
            except Exception:
                new_id = old_id

        conn.execute(
            """
            INSERT OR REPLACE INTO books (id, path, title, fmt, last_loc, last_read, added)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (new_id, old_path, old_title, old_fmt, old_loc, old_added, old_added),
        )

    conn.execute("DROP TABLE _books_old")


def _import_legacy_saves(conn: sqlite3.Connection, current_db_path: Path) -> None:
    """One-time import of legacy last-page save files if present."""
    base_dir = current_db_path.parent

    # 1. Check data/reader.db if different from current_db_path
    legacy_db_path = base_dir / "data" / "reader.db"
    if legacy_db_path.is_file() and legacy_db_path.resolve() != current_db_path.resolve():
        try:
            legacy_conn = sqlite3.connect(legacy_db_path)
            legacy_conn.row_factory = sqlite3.Row
            l_cursor = legacy_conn.cursor()

            l_cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='books'")
            has_books = l_cursor.fetchone() is not None
            l_cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='reading_progress'")
            has_progress = l_cursor.fetchone() is not None

            progress_map: dict[str, str] = {}
            if has_progress:
                for row in legacy_conn.execute("SELECT book_id, scroll_offset FROM reading_progress").fetchall():
                    progress_map[row["book_id"]] = str(row["scroll_offset"])

            if has_books:
                for row in legacy_conn.execute("SELECT * FROM books").fetchall():
                    old_path = row["file_path"] if "file_path" in row.keys() else row["path"]
                    old_title = row["title"]
                    old_fmt = row["format"] if "format" in row.keys() else row.get("fmt", "")
                    old_added = row["added_at"] if "added_at" in row.keys() else datetime.now().isoformat()
                    old_loc = progress_map.get(row["id"], "")

                    resolved_path = old_path
                    new_id = row["id"]
                    if old_path and Path(old_path).is_file():
                        try:
                            new_id = book_id(old_path)
                            resolved_path = str(Path(old_path).resolve())
                        except Exception:
                            pass
                    else:
                        if old_path:
                            candidate_name = Path(old_path).name
                            for sub in ["samples", "test_fixtures"]:
                                cand = base_dir / sub / candidate_name
                                if cand.is_file():
                                    try:
                                        new_id = book_id(cand)
                                        resolved_path = str(cand.resolve())
                                        break
                                    except Exception:
                                        pass

                    conn.execute(
                        """
                        INSERT OR IGNORE INTO books (id, path, title, fmt, last_loc, last_read, added)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                        """,
                        (new_id, resolved_path, old_title, old_fmt, old_loc, old_added, old_added),
                    )

            # Copy legacy highlights, bookmarks, saved_words if any
            for tbl in ["highlights", "saved_words", "bookmarks"]:
                l_cursor.execute(f"SELECT name FROM sqlite_master WHERE type='table' AND name='{tbl}'")
                if l_cursor.fetchone():
                    rows = legacy_conn.execute(f"SELECT * FROM {tbl}").fetchall()
                    for r in rows:
                        d = dict(r)
                        cols = ", ".join(d.keys())
                        placeholders = ", ".join("?" for _ in d)
                        conn.execute(f"INSERT OR IGNORE INTO {tbl} ({cols}) VALUES ({placeholders})", tuple(d.values()))

            legacy_conn.close()
        except Exception:
            pass

    # 2. Check for JSON progress files
    for json_name in ["progress.json", "last_pages.json", "last_page.json", "reading_progress.json"]:
        for search_dir in [base_dir, base_dir / "data"]:
            json_file = search_dir / json_name
            if json_file.is_file():
                try:
                    with open(json_file, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    if isinstance(data, dict):
                        for k, v in data.items():
                            loc_str = str(v)
                            if Path(k).is_file():
                                bid = book_id(k)
                                conn.execute("UPDATE books SET last_loc = ? WHERE id = ?", (loc_str, bid))
                            else:
                                conn.execute("UPDATE books SET last_loc = ? WHERE id = ?", (loc_str, k))
                except Exception:
                    pass


def insert_book_if_new(path: str | Path, title: str, fmt: str, db_path: Path | str | None = None) -> tuple[str, bool]:
    """Insert book into books table if it is new.

    If book already exists, updates path (in case of rename/move) and last_read.
    Returns (book_id, is_new).
    """
    bid = book_id(path)
    resolved_path = str(Path(path).resolve())
    now = datetime.now().isoformat()
    with get_db(db_path) as conn:
        row = conn.execute("SELECT id, path, last_loc FROM books WHERE id = ?", (bid,)).fetchone()
        if row is None:
            conn.execute(
                """
                INSERT INTO books (id, path, title, fmt, last_loc, last_read, added)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (bid, resolved_path, title, fmt, "", now, now),
            )
            return bid, True
        else:
            conn.execute(
                "UPDATE books SET path = ?, last_read = ? WHERE id = ?",
                (resolved_path, now, bid),
            )
            return bid, False


def save_last_loc(bid: str, last_loc: str, db_path: Path | str | None = None) -> None:
    """Save last reading location for a book."""
    now = datetime.now().isoformat()
    with get_db(db_path) as conn:
        conn.execute(
            "UPDATE books SET last_loc = ?, last_read = ? WHERE id = ?",
            (str(last_loc), now, bid),
        )


def get_last_loc(bid: str, db_path: Path | str | None = None) -> str:
    """Get last reading location for a book."""
    with get_db(db_path) as conn:
        row = conn.execute("SELECT last_loc FROM books WHERE id = ?", (bid,)).fetchone()
        if row and row["last_loc"]:
            return row["last_loc"]
    return ""


def get_book(bid: str, db_path: Path | str | None = None) -> dict | None:
    """Get book record by id."""
    with get_db(db_path) as conn:
        row = conn.execute("SELECT id, path, title, fmt, last_loc, last_read, added FROM books WHERE id = ?", (bid,)).fetchone()
        return dict(row) if row else None


def get_all_books(db_path: Path | str | None = None) -> list[dict]:
    """Get all books ordered by last read / added."""
    with get_db(db_path) as conn:
        rows = conn.execute(
            "SELECT id, path, title, fmt, last_loc, last_read, added FROM books ORDER BY COALESCE(last_read, added) DESC"
        ).fetchall()
        return [dict(r) for r in rows]


def add_mark(book_id: str, loc: str, quote: str = "", note: str = "", color: str = "", created: str | None = None, db_path: Path | str | None = None) -> int:
    """Add a mark (bookmark / highlight / annotation) for a book.

    Also creates a review row due tomorrow with interval 1 day.
    """
    if created is None:
        created = datetime.now().isoformat()
    with get_db(db_path) as conn:
        cursor = conn.execute(
            """
            INSERT INTO marks (book_id, loc, quote, note, color, created)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (book_id, str(loc), quote, note, color, created),
        )
        mark_id = cursor.lastrowid
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        conn.execute(
            "INSERT OR IGNORE INTO reviews (mark_id, due, interval_days) VALUES (?, ?, ?)",
            (mark_id, tomorrow, 1),
        )
        return mark_id


def get_marks(book_id: str, db_path: Path | str | None = None) -> list[dict]:
    """Get all marks for a book."""
    with get_db(db_path) as conn:
        rows = conn.execute(
            "SELECT id, book_id, loc, quote, note, color, created FROM marks WHERE book_id = ? ORDER BY id ASC",
            (book_id,),
        ).fetchall()
        return [dict(r) for r in rows]


def delete_mark(mark_id: int, db_path: Path | str | None = None) -> None:
    """Delete a mark by id, along with its associated review entry."""
    with get_db(db_path) as conn:
        conn.execute("DELETE FROM marks WHERE id = ?", (mark_id,))
        conn.execute("DELETE FROM reviews WHERE mark_id = ?", (mark_id,))


def get_mark(mark_id: int, db_path: Path | str | None = None) -> dict | None:
    """Get a single mark by id."""
    with get_db(db_path) as conn:
        row = conn.execute(
            "SELECT id, book_id, loc, quote, note, color, created FROM marks WHERE id = ?",
            (mark_id,),
        ).fetchone()
        return dict(row) if row else None


def update_mark(
    mark_id: int,
    note: str | None = None,
    quote: str | None = None,
    color: str | None = None,
    db_path: Path | str | None = None,
) -> None:
    """Update mark note, quote, or color."""
    with get_db(db_path) as conn:
        fields = []
        params = []
        if note is not None:
            fields.append("note = ?")
            params.append(note)
        if quote is not None:
            fields.append("quote = ?")
            params.append(quote)
        if color is not None:
            fields.append("color = ?")
            params.append(color)
        if fields:
            params.append(mark_id)
            conn.execute(f"UPDATE marks SET {', '.join(fields)} WHERE id = ?", tuple(params))


# ── Full-text search (FTS5) ───────────────────────────────────────────

def clear_book_index(book_id: str, db_path: Path | str | None = None) -> None:
    """Delete all indexed pages for a book (before re-indexing)."""
    with get_db(db_path) as conn:
        conn.execute("DELETE FROM pages WHERE book_id = ?", (book_id,))


def book_is_indexed(book_id: str, db_path: Path | str | None = None) -> bool:
    """Return True if the book already has at least one indexed page."""
    with get_db(db_path) as conn:
        row = conn.execute(
            "SELECT 1 FROM pages WHERE book_id = ? LIMIT 1", (book_id,)
        ).fetchone()
    return row is not None


def index_book_page(book_id: str, loc: str, text: str,
                   db_path: Path | str | None = None) -> None:
    """Insert one page/chapter into the FTS5 index."""
    with get_db(db_path) as conn:
        conn.execute(
            "INSERT INTO pages (book_id, loc, text) VALUES (?, ?, ?)",
            (book_id, loc, text),
        )


def index_book_pages_bulk(book_id: str, pages: list[tuple[str, str]],
                          db_path: Path | str | None = None) -> None:
    """Bulk-insert (loc, text) pairs for a book.  Clears existing first."""
    with get_db(db_path) as conn:
        conn.execute("DELETE FROM pages WHERE book_id = ?", (book_id,))
        conn.executemany(
            "INSERT INTO pages (book_id, loc, text) VALUES (?, ?, ?)",
            [(book_id, loc, text) for loc, text in pages],
        )


def search_pages(
    query: str,
    book_id: str | None = None,
    limit: int = 50,
    db_path: Path | str | None = None,
) -> list[dict]:
    """FTS5 search.  Returns list of dicts with book_id, loc, snippet, title.

    If book_id is given, searches only that book; otherwise searches all.
    Each result dict has keys: book_id, loc, snippet, title, fmt.
    """
    # Escape special FTS5 characters in the user query
    safe_q = query.replace('"', '""')
    fts_query = f'"{safe_q}"'   # phrase search by default

    with get_db(db_path) as conn:
        if book_id:
            rows = conn.execute(
                """
                SELECT p.book_id, p.loc,
                       snippet(pages, 2, '<b>', '</b>', '...', 12) AS snippet,
                       b.title, b.fmt
                FROM pages p
                JOIN books b ON b.id = p.book_id
                WHERE pages MATCH ? AND p.book_id = ?
                LIMIT ?
                """,
                (fts_query, book_id, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT p.book_id, p.loc,
                       snippet(pages, 2, '<b>', '</b>', '...', 12) AS snippet,
                       b.title, b.fmt
                FROM pages p
                JOIN books b ON b.id = p.book_id
                WHERE pages MATCH ?
                LIMIT ?
                """,
                (fts_query, limit),
            ).fetchall()

    return [dict(r) for r in rows]


# ── Spaced-Repetition Reviews ────────────────────────────────────────

def get_due_review_count(db_path: Path | str | None = None) -> int:
    """Return the number of review cards due today or earlier."""
    today = datetime.now().strftime("%Y-%m-%d")
    with get_db(db_path) as conn:
        row = conn.execute(
            "SELECT COUNT(*) AS cnt FROM reviews WHERE due <= ?", (today,)
        ).fetchone()
        return row["cnt"] if row else 0


count_due_reviews = get_due_review_count


def get_due_reviews(limit: int = 10, db_path: Path | str | None = None) -> list[dict]:
    """Return up to *limit* review cards that are due today or earlier.

    Each dict has: mark_id, due, interval_days, quote, note, book_title.
    """
    today = datetime.now().strftime("%Y-%m-%d")
    with get_db(db_path) as conn:
        rows = conn.execute(
            """
            SELECT r.mark_id, r.due, r.interval_days,
                   m.quote, m.note,
                   b.title AS book_title
            FROM reviews r
            JOIN marks m ON m.id = r.mark_id
            JOIN books b ON b.id = m.book_id
            WHERE r.due <= ?
            ORDER BY r.due ASC
            LIMIT ?
            """,
            (today, limit),
        ).fetchall()
        return [dict(r) for r in rows]


def rate_review(mark_id: int, rating: str, db_path: Path | str | None = None) -> None:
    """Update a review card after the user rates it.

    rating must be one of: 'forgot', 'hard', 'good', 'easy'.
    """
    multiplier = {"forgot": 0, "hard": 1.2, "good": 2, "easy": 3}
    if rating not in multiplier:
        raise ValueError(f"Invalid rating '{rating}'; expected forgot/hard/good/easy")

    with get_db(db_path) as conn:
        row = conn.execute(
            "SELECT interval_days FROM reviews WHERE mark_id = ?", (mark_id,)
        ).fetchone()
        if row is None:
            return

        old_interval = row["interval_days"]
        if rating == "forgot":
            new_interval = 1
        else:
            new_interval = math.ceil(old_interval * multiplier[rating])

        new_due = (datetime.now() + timedelta(days=new_interval)).strftime("%Y-%m-%d")
        conn.execute(
            "UPDATE reviews SET due = ?, interval_days = ? WHERE mark_id = ?",
            (new_due, new_interval, mark_id),
        )


def delete_review(mark_id: int, db_path: Path | str | None = None) -> None:
    """Delete a review entry (e.g. when the associated mark is deleted)."""
    with get_db(db_path) as conn:
        conn.execute("DELETE FROM reviews WHERE mark_id = ?", (mark_id,))


# ── Chapter Actions ──────────────────────────────────────────────────

def add_action(
    book_id: str,
    loc: str,
    text: str,
    db_path: Path | str | None = None,
) -> int:
    """Store an action step created upon finishing a chapter.
    
    actions(id, book_id, loc, text, created, done INTEGER DEFAULT 0)
    """
    created = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with get_db(db_path) as conn:
        cursor = conn.execute(
            """
            INSERT INTO actions (book_id, loc, text, created, done)
            VALUES (?, ?, ?, ?, 0)
            """,
            (book_id, loc, text, created),
        )
        return cursor.lastrowid


def get_actions(
    book_id: str | None = None,
    db_path: Path | str | None = None,
) -> list[dict]:
    """Retrieve all chapter action steps, optionally filtered by book_id.
    
    Joins with books table to provide book_title when available.
    """
    with get_db(db_path) as conn:
        if book_id:
            rows = conn.execute(
                """
                SELECT a.id, a.book_id, a.loc, a.text, a.created, a.done,
                       b.title AS book_title
                FROM actions a
                LEFT JOIN books b ON b.id = a.book_id
                WHERE a.book_id = ?
                ORDER BY a.created DESC, a.id DESC
                """,
                (book_id,),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT a.id, a.book_id, a.loc, a.text, a.created, a.done,
                       b.title AS book_title
                FROM actions a
                LEFT JOIN books b ON b.id = a.book_id
                ORDER BY a.created DESC, a.id DESC
                """
            ).fetchall()
        return [dict(r) for r in rows]


def set_action_done(
    action_id: int,
    done: int = 1,
    db_path: Path | str | None = None,
) -> None:
    """Toggle or set the done flag (0 or 1) on an action step."""
    with get_db(db_path) as conn:
        conn.execute(
            "UPDATE actions SET done = ? WHERE id = ?",
            (1 if done else 0, action_id),
        )


def delete_action(action_id: int, db_path: Path | str | None = None) -> None:
    """Delete an action step by id."""
    with get_db(db_path) as conn:
        conn.execute("DELETE FROM actions WHERE id = ?", (action_id,))


# ── Vocabulary ────────────────────────────────────────────────────────

def add_vocab(
    word: str,
    definition: str,
    book: str,
    date: str | None = None,
    db_path: Path | str | None = None,
) -> int:
    """Store a vocabulary word, definition, book, and date in the vocab table."""
    date_str = date or datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with get_db(db_path) as conn:
        cursor = conn.execute(
            """
            INSERT INTO vocab (word, definition, book, date)
            VALUES (?, ?, ?, ?)
            """,
            (word.strip(), definition.strip(), book.strip(), date_str),
        )
        return cursor.lastrowid


def get_vocab(
    book: str | None = None,
    db_path: Path | str | None = None,
) -> list[dict]:
    """Retrieve all saved vocabulary entries, optionally filtered by book."""
    with get_db(db_path) as conn:
        if book:
            rows = conn.execute(
                """
                SELECT id, word, definition, book, date
                FROM vocab
                WHERE book = ?
                ORDER BY id DESC
                """,
                (book,),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT id, word, definition, book, date
                FROM vocab
                ORDER BY id DESC
                """
            ).fetchall()
        return [dict(r) for r in rows]


def delete_vocab(vocab_id: int, db_path: Path | str | None = None) -> None:
    """Delete a saved vocabulary word by id."""
    with get_db(db_path) as conn:
        conn.execute("DELETE FROM vocab WHERE id = ?", (vocab_id,))


# ── Reading Sessions ─────────────────────────────────────────────────

def add_session(
    book_id: str,
    start: str,
    seconds: int,
    db_path: Path | str | None = None,
) -> int:
    """Record a reading session in sessions(id, book_id, start, seconds)."""
    with get_db(db_path) as conn:
        cursor = conn.execute(
            """
            INSERT INTO sessions (book_id, start, seconds)
            VALUES (?, ?, ?)
            """,
            (book_id, start, seconds),
        )
        return cursor.lastrowid


def get_sessions(
    book_id: str | None = None,
    db_path: Path | str | None = None,
) -> list[dict]:
    """Retrieve all reading sessions, optionally filtered by book_id."""
    with get_db(db_path) as conn:
        if book_id:
            rows = conn.execute(
                """
                SELECT id, book_id, start, seconds
                FROM sessions
                WHERE book_id = ?
                ORDER BY start DESC, id DESC
                """,
                (book_id,),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT id, book_id, start, seconds
                FROM sessions
                ORDER BY start DESC, id DESC
                """
            ).fetchall()
        return [dict(r) for r in rows]

