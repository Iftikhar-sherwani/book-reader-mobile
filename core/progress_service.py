"""Progress calculation and relative time service for Book Reader.

Progress for PDF: page / total pages.
Progress for EPUB: chapter / total chapters.
"""

from datetime import datetime
from pathlib import Path
import fitz


def calculate_progress(file_path: str | Path, fmt: str, last_loc: str | None) -> tuple[float, str]:
    """Calculate reading progress as (ratio [0.0 - 1.0], label_text).

    For PDF: page / total pages.
    For EPUB: chapter / total chapters.
    """
    path = Path(file_path)
    if not path.is_file():
        return 0.0, "0%"

    fmt_lower = fmt.lower() if fmt else path.suffix.lstrip(".").lower()

    offset = 0
    has_loc = False
    if last_loc is not None and str(last_loc).strip() != "":
        try:
            offset = int(last_loc)
            has_loc = True
        except ValueError:
            has_loc = False

    idx = offset // 100000

    if fmt_lower == "pdf":
        try:
            doc = fitz.open(str(path))
            total_pages = len(doc)
            doc.close()
            if total_pages <= 0:
                return 0.0, "0%"

            if not has_loc:
                current_page = 0
            else:
                # If offset is 0, user opened page 1
                current_page = min(total_pages, max(1, idx + 1))

            if current_page == 0:
                return 0.0, f"0 of {total_pages} pages"

            ratio = current_page / total_pages
            pct = int(ratio * 100)
            return ratio, f"Page {current_page} of {total_pages} ({pct}%)"
        except Exception:
            return 0.0, "0%"

    elif fmt_lower == "epub":
        try:
            doc = fitz.open(str(path))
            total_chapters = len(doc)
            doc.close()
            if total_chapters <= 0:
                total_chapters = 1

            if not has_loc:
                current_chapter = 0
            else:
                current_chapter = min(total_chapters, max(1, idx + 1))

            if current_chapter == 0:
                return 0.0, f"0 of {total_chapters} chapters"

            ratio = current_chapter / total_chapters
            pct = int(ratio * 100)
            return ratio, f"Chapter {current_chapter} of {total_chapters} ({pct}%)"
        except Exception:
            return 0.0, "0%"

    else:
        # Fallback for TXT or other text formats
        if not has_loc:
            return 0.0, "Not started"
        return 0.5, f"Page {idx + 1}"


def format_relative_time(ts_str: str | None) -> str:
    """Format an ISO or SQL timestamp into 'last read 3 days ago' text."""
    if not ts_str:
        return "Never read"
    try:
        clean_ts = str(ts_str).replace("Z", "").replace(" ", "T")
        dt = datetime.fromisoformat(clean_ts)
    except Exception:
        return "Never read"

    now = datetime.now()
    diff = now - dt
    total_seconds = int(diff.total_seconds())

    if total_seconds < 60:
        return "last read just now"
    minutes = total_seconds // 60
    if minutes < 60:
        return f"last read {minutes}m ago" if minutes > 1 else "last read 1m ago"
    hours = minutes // 60
    if hours < 24:
        return f"last read {hours}h ago" if hours > 1 else "last read 1h ago"
    days = hours // 24
    if days == 1:
        return "last read yesterday"
    if days < 7:
        return f"last read {days} days ago"
    weeks = days // 7
    if weeks < 5:
        return f"last read {weeks} weeks ago" if weeks > 1 else "last read 1 week ago"
    months = days // 30
    if months < 12:
        return f"last read {months} months ago" if months > 1 else "last read 1 month ago"
    years = days // 365
    return f"last read {years} years ago" if years > 1 else "last read 1 year ago"
