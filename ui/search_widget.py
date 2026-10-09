"""Search panel widget for Book Reader.

A slide-down panel containing:
  - A text input with a search icon
  - "This book" / "All books" toggle buttons
  - A results list showing FTS5 snippet + book title + location
  - A small indexing progress bar that hides once indexing completes

Each result carries (book_id, loc, fmt) stored in item data so
the caller can jump to that location.
"""

from __future__ import annotations
import html as html_module
import re

from PyQt6.QtCore import Qt, pyqtSignal, QTimer
from PyQt6.QtGui import QFont
from PyQt6.QtWidgets import (
    QFrame,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QListWidget,
    QListWidgetItem,
    QProgressBar,
    QPushButton,
    QSizePolicy,
    QVBoxLayout,
    QWidget,
)

import db

# ── Palette (matches main_window) ────────────────────────────────────
PANEL_BG     = "#1A1714"
PANEL_BORDER = "rgba(196, 179, 138, 0.15)"
ACCENT       = "#D4AF55"
TEXT         = "#C4B38A"
TEXT_DIM     = "#7A6F5E"
INPUT_BG     = "#13110E"
HOVER        = "rgba(212, 175, 85, 0.08)"
SELECTED     = "rgba(212, 175, 85, 0.15)"

_TAG_RE = re.compile(r"<[^>]+>")


def _strip_html(s: str) -> str:
    return html_module.unescape(_TAG_RE.sub("", s))


class SearchPanel(QWidget):
    """Drop-down search panel attached to the top of the reader area.

    Signals:
        result_activated(book_id, loc, fmt) — user clicked a result
        closed()                            — user dismissed the panel
    """

    result_activated = pyqtSignal(str, str, str)  # book_id, loc, fmt
    closed = pyqtSignal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self._current_book_id: str | None = None
        self._search_mode = "book"   # "book" or "all"
        self._debounce = QTimer(self)
        self._debounce.setSingleShot(True)
        self._debounce.setInterval(300)
        self._debounce.timeout.connect(self._run_search)

        self._build_ui()
        self.setMaximumHeight(0)   # starts collapsed
        self._visible = False

    # ── UI ────────────────────────────────────────────────────────────

    def _build_ui(self) -> None:
        self.setStyleSheet(f"""
            SearchPanel {{
                background: {PANEL_BG};
                border-bottom: 1px solid {PANEL_BORDER};
            }}
        """)

        outer = QVBoxLayout(self)
        outer.setContentsMargins(20, 12, 20, 10)
        outer.setSpacing(8)

        # ── Row 1: input + mode toggle + close ────────────────────────
        row1 = QHBoxLayout()
        row1.setSpacing(8)

        # Search icon label
        icon = QLabel("🔍")
        icon.setStyleSheet("font-size: 15px; background: transparent;")
        row1.addWidget(icon)

        self.search_input = QLineEdit()
        self.search_input.setPlaceholderText("Search…")
        self.search_input.setClearButtonEnabled(True)
        self.search_input.setStyleSheet(f"""
            QLineEdit {{
                background: {INPUT_BG};
                color: {TEXT};
                border: 1px solid rgba(196, 179, 138, 0.2);
                border-radius: 6px;
                padding: 7px 12px;
                font-size: 13px;
                font-family: Georgia, serif;
            }}
            QLineEdit:focus {{
                border-color: {ACCENT};
            }}
        """)
        self.search_input.textChanged.connect(self._on_text_changed)
        self.search_input.returnPressed.connect(self._run_search)
        row1.addWidget(self.search_input, 1)

        # Mode toggle
        toggle_style_base = f"""
            QPushButton {{
                background: transparent;
                color: {TEXT_DIM};
                border: 1px solid rgba(196, 179, 138, 0.2);
                border-radius: 5px;
                padding: 6px 12px;
                font-size: 11px;
                font-weight: bold;
                letter-spacing: 0.8px;
            }}
            QPushButton:hover {{
                color: {TEXT};
                border-color: rgba(196, 179, 138, 0.4);
            }}
        """
        toggle_style_active = f"""
            QPushButton {{
                background: rgba(212, 175, 85, 0.18);
                color: {ACCENT};
                border: 1px solid rgba(212, 175, 85, 0.5);
                border-radius: 5px;
                padding: 6px 12px;
                font-size: 11px;
                font-weight: bold;
                letter-spacing: 0.8px;
            }}
        """

        self._toggle_base = toggle_style_base
        self._toggle_active = toggle_style_active

        self.btn_this = QPushButton("THIS BOOK")
        self.btn_this.setCursor(Qt.CursorShape.PointingHandCursor)
        self.btn_this.setCheckable(False)
        self.btn_this.clicked.connect(lambda: self._set_mode("book"))
        row1.addWidget(self.btn_this)

        self.btn_all = QPushButton("ALL BOOKS")
        self.btn_all.setCursor(Qt.CursorShape.PointingHandCursor)
        self.btn_all.setCheckable(False)
        self.btn_all.clicked.connect(lambda: self._set_mode("all"))
        row1.addWidget(self.btn_all)

        # Close button
        close_btn = QPushButton("✕")
        close_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        close_btn.setFixedSize(28, 28)
        close_btn.setStyleSheet(f"""
            QPushButton {{
                background: transparent;
                color: {TEXT_DIM};
                border: none;
                font-size: 14px;
            }}
            QPushButton:hover {{
                color: {TEXT};
            }}
        """)
        close_btn.clicked.connect(self.hide_panel)
        row1.addWidget(close_btn)

        outer.addLayout(row1)

        # ── Indexing progress bar (hidden by default) ─────────────────
        self.index_bar_widget = QWidget()
        index_row = QHBoxLayout(self.index_bar_widget)
        index_row.setContentsMargins(0, 0, 0, 0)
        index_row.setSpacing(8)

        self.index_label = QLabel("Indexing…")
        self.index_label.setStyleSheet(f"color: {TEXT_DIM}; font-size: 11px;")
        index_row.addWidget(self.index_label)

        self.index_bar = QProgressBar()
        self.index_bar.setTextVisible(False)
        self.index_bar.setFixedHeight(4)
        self.index_bar.setStyleSheet(f"""
            QProgressBar {{
                background: rgba(196, 179, 138, 0.1);
                border: none;
                border-radius: 2px;
            }}
            QProgressBar::chunk {{
                background: {ACCENT};
                border-radius: 2px;
            }}
        """)
        index_row.addWidget(self.index_bar, 1)

        self.index_bar_widget.hide()
        outer.addWidget(self.index_bar_widget)

        # ── Results list ──────────────────────────────────────────────
        self.results_list = QListWidget()
        self.results_list.setFixedHeight(260)
        self.results_list.setStyleSheet(f"""
            QListWidget {{
                background: {INPUT_BG};
                border: 1px solid {PANEL_BORDER};
                border-radius: 6px;
                padding: 4px;
                outline: none;
            }}
            QListWidget::item {{
                color: {TEXT};
                padding: 10px 12px;
                border-radius: 5px;
                margin: 1px 0;
            }}
            QListWidget::item:hover {{
                background: {HOVER};
            }}
            QListWidget::item:selected {{
                background: {SELECTED};
                color: {ACCENT};
            }}
            QScrollBar:vertical {{
                background: {INPUT_BG};
                width: 6px;
                margin: 2px;
                border-radius: 3px;
            }}
            QScrollBar::handle:vertical {{
                background: rgba(196, 179, 138, 0.2);
                min-height: 20px;
                border-radius: 3px;
            }}
            QScrollBar::add-line:vertical,
            QScrollBar::sub-line:vertical {{ height: 0px; }}
        """)
        self.results_list.hide()
        self.results_list.itemClicked.connect(self._on_result_clicked)
        outer.addWidget(self.results_list)

        # ── Status label ──────────────────────────────────────────────
        self.status_label = QLabel("")
        self.status_label.setStyleSheet(f"color: {TEXT_DIM}; font-size: 11px;")
        self.status_label.setAlignment(Qt.AlignmentFlag.AlignRight)
        outer.addWidget(self.status_label)

        self._set_mode("book")   # initial mode

    # ── Public API ────────────────────────────────────────────────────

    def set_current_book(self, book_id: str | None) -> None:
        self._current_book_id = book_id
        if book_id is None:
            self._set_mode("all")
        else:
            self._set_mode("book")

    def show_panel(self) -> None:
        """Expand and focus the search panel."""
        self.setMaximumHeight(16777215)
        self.show()
        self._visible = True
        self.search_input.setFocus()
        self.search_input.selectAll()

    def hide_panel(self) -> None:
        """Collapse the search panel."""
        self.setMaximumHeight(0)
        self._visible = False
        self.closed.emit()

    def is_visible(self) -> bool:
        return self._visible

    def show_index_progress(self, current: int, total: int) -> None:
        self.index_bar_widget.show()
        self.index_bar.setMaximum(max(total, 1))
        self.index_bar.setValue(current)
        self.index_label.setText(f"Indexing… {current}/{total}")

    def hide_index_progress(self, message: str = "") -> None:
        self.index_bar_widget.hide()
        if message:
            self.status_label.setText(message)
            QTimer.singleShot(4000, lambda: self.status_label.setText(""))

    # ── Mode toggle ───────────────────────────────────────────────────

    def _set_mode(self, mode: str) -> None:
        self._search_mode = mode
        self.btn_this.setStyleSheet(
            self._toggle_active if mode == "book" else self._toggle_base
        )
        self.btn_all.setStyleSheet(
            self._toggle_active if mode == "all" else self._toggle_base
        )
        self.btn_this.setEnabled(self._current_book_id is not None)
        if self.search_input.text().strip():
            self._run_search()

    # ── Search logic ──────────────────────────────────────────────────

    def _on_text_changed(self, text: str) -> None:
        if not text.strip():
            self.results_list.clear()
            self.results_list.hide()
            self.status_label.setText("")
            return
        self._debounce.start()

    def _run_search(self) -> None:
        query = self.search_input.text().strip()
        if not query:
            return

        book_id = self._current_book_id if self._search_mode == "book" else None

        try:
            results = db.search_pages(query, book_id=book_id, limit=50)
        except Exception as exc:
            self.status_label.setText(f"Search error: {exc}")
            return

        self.results_list.clear()

        if not results:
            self.status_label.setText("No results found.")
            self.results_list.hide()
            return

        self.status_label.setText(f"{len(results)} result{'s' if len(results) != 1 else ''}")
        self.results_list.show()

        fmt_icons = {"epub": "📕", "pdf": "📄", "txt": "📝"}

        for r in results:
            snippet = _strip_html(r.get("snippet") or "").strip()
            snippet = " ".join(snippet.split())   # collapse whitespace
            if len(snippet) > 120:
                snippet = snippet[:120] + "…"

            title  = r.get("title", "Unknown")
            fmt    = r.get("fmt", "")
            loc    = r.get("loc", "")
            bid    = r.get("book_id", "")

            icon = fmt_icons.get(fmt, "📖")

            # Build location label
            if fmt == "pdf":
                try:
                    loc_label = f"Page {int(loc) + 1}"
                except (ValueError, TypeError):
                    loc_label = f"Page {loc}"
            elif fmt == "epub":
                try:
                    loc_label = f"Ch. {int(loc) + 1}"
                except (ValueError, TypeError):
                    loc_label = f"Ch. {loc}"
            else:
                loc_label = f"§{loc}"

            # Two-line item: snippet on top, book + location below
            if self._search_mode == "all":
                label = f"{snippet}\n{icon}  {title}  —  {loc_label}"
            else:
                label = f"{snippet}\n{loc_label}"

            item = QListWidgetItem(label)
            item.setData(256, bid)
            item.setData(257, loc)
            item.setData(258, fmt)
            item.setSizeHint(item.sizeHint().__class__(0, 52))
            self.results_list.addItem(item)

    def _on_result_clicked(self, item: QListWidgetItem) -> None:
        bid = item.data(256)
        loc = item.data(257)
        fmt = item.data(258)
        if bid and loc is not None:
            self.result_activated.emit(bid, str(loc), fmt or "")
