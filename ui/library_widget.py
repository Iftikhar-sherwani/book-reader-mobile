"""Library home screen for Book Reader.

Displays books from the database as rich cards with:
- Cover image (cached PNG from PDF/EPUB or elegant placeholder)
- Book title and format badge
- Progress bar and progress label (page/total for PDF, chapter/total for EPUB)
- Relative last read timestamp ("last read 3 days ago")
- Add Book button with file picker
"""

from pathlib import Path
from PyQt6.QtCore import Qt, pyqtSignal, QSize
from PyQt6.QtGui import QFont, QPixmap, QPainter, QColor, QPen
from PyQt6.QtWidgets import (
    QApplication,
    QFileDialog,
    QFrame,
    QHBoxLayout,
    QLabel,
    QMessageBox,
    QProgressBar,
    QPushButton,
    QScrollArea,
    QSizePolicy,
    QVBoxLayout,
    QWidget,
    QGridLayout,
)

from core import cover_service, progress_service
import db

# ── Color Palette (consistent with main_window) ──────────────────────
SIDEBAR_BG = "#1A1714"
SIDEBAR_DARKER = "#13110E"
SIDEBAR_TEXT = "#C4B38A"
SIDEBAR_TEXT_DIM = "#7A6F5E"
SIDEBAR_ACCENT = "#D4AF55"
OUTER_BG = "#141210"
CARD_BG = "#1E1B16"
CARD_BORDER = "rgba(196, 179, 138, 0.15)"
CARD_BORDER_HOVER = "#D4AF55"
PLACEHOLDER_BG = "#23201C"


class BookCardWidget(QFrame):
    """An interactive card displaying book cover, title, badge, progress, and last read time."""

    clicked = pyqtSignal(str)  # emits book_id

    def __init__(self, book: dict, parent=None):
        super().__init__(parent)
        self.book_id = book["id"]
        self.file_path = book.get("path", "")
        self.title = book.get("title", "Untitled")
        self.fmt = (book.get("fmt") or "pdf").upper()
        self.last_loc = book.get("last_loc", "")
        self.last_read = book.get("last_read")

        self.setFixedWidth(196)
        self.setFixedHeight(356)
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self._build_ui()

    def _build_ui(self) -> None:
        self.setStyleSheet(f"""
            BookCardWidget {{
                background: {CARD_BG};
                border: 1px solid {CARD_BORDER};
                border-radius: 10px;
            }}
            BookCardWidget:hover {{
                border: 1px solid {CARD_BORDER_HOVER};
                background: #25221C;
            }}
        """)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(10, 10, 10, 12)
        layout.setSpacing(6)

        # ── 1. Cover container ───────────────────────────────────────
        cover_container = QWidget()
        cover_container.setFixedSize(176, 220)
        cover_layout = QVBoxLayout(cover_container)
        cover_layout.setContentsMargins(0, 0, 0, 0)
        cover_layout.setSpacing(0)

        cover_path = cover_service.get_or_create_cover(self.book_id, self.file_path, self.fmt)

        cover_label = QLabel()
        cover_label.setFixedSize(176, 220)
        cover_label.setAlignment(Qt.AlignmentFlag.AlignCenter)

        if cover_path and Path(cover_path).is_file():
            pix = QPixmap(str(cover_path))
            if not pix.isNull():
                scaled_pix = pix.scaled(
                    176, 220,
                    Qt.AspectRatioMode.KeepAspectRatioByExpanding,
                    Qt.TransformationMode.SmoothTransformation,
                )
                # Crop to exact 176x220
                if scaled_pix.width() > 176 or scaled_pix.height() > 220:
                    x = (scaled_pix.width() - 176) // 2
                    y = (scaled_pix.height() - 220) // 2
                    scaled_pix = scaled_pix.copy(x, y, 176, 220)

                cover_label.setPixmap(scaled_pix)
                cover_label.setStyleSheet("""
                    QLabel {
                        border-radius: 6px;
                        background: #000;
                    }
                """)
            else:
                self._apply_placeholder(cover_label)
        else:
            self._apply_placeholder(cover_label)

        cover_layout.addWidget(cover_label)
        layout.addWidget(cover_container)

        # ── 2. Format badge & Title row ──────────────────────────────
        meta_row = QHBoxLayout()
        meta_row.setContentsMargins(2, 2, 2, 0)
        meta_row.setSpacing(6)

        # Format Badge
        badge = QLabel(self.fmt)
        badge_color = "#E5A93C" if self.fmt == "EPUB" else "#E57373" if self.fmt == "PDF" else "#81C784"
        badge.setStyleSheet(f"""
            QLabel {{
                background: rgba(212, 175, 85, 0.12);
                color: {badge_color};
                font-size: 10px;
                font-weight: bold;
                border: 1px solid rgba(212, 175, 85, 0.25);
                border-radius: 3px;
                padding: 1px 5px;
                letter-spacing: 0.5px;
            }}
        """)
        meta_row.addWidget(badge)
        meta_row.addStretch()
        layout.addLayout(meta_row)

        # Book Title
        title_label = QLabel(self.title)
        title_label.setToolTip(self.title)
        title_label.setStyleSheet(f"""
            QLabel {{
                color: #EDE3CE;
                font-size: 12px;
                font-weight: 600;
                font-family: Georgia, 'Palatino Linotype', serif;
            }}
        """)
        # Elide title to fit cleanly
        font_metrics = title_label.fontMetrics()
        elided = font_metrics.elidedText(self.title, Qt.TextElideMode.ElideRight, 172)
        title_label.setText(elided)
        layout.addWidget(title_label)

        # ── 3. Progress bar & Progress text ──────────────────────────
        ratio, progress_text = progress_service.calculate_progress(
            self.file_path, self.fmt, self.last_loc
        )

        pbar = QProgressBar()
        pbar.setFixedHeight(5)
        pbar.setTextVisible(False)
        pbar.setRange(0, 100)
        pbar.setValue(int(ratio * 100))
        pbar.setStyleSheet(f"""
            QProgressBar {{
                background: rgba(255, 255, 255, 0.08);
                border: none;
                border-radius: 2px;
            }}
            QProgressBar::chunk {{
                background: {SIDEBAR_ACCENT};
                border-radius: 2px;
            }}
        """)
        layout.addWidget(pbar)

        info_row = QHBoxLayout()
        info_row.setContentsMargins(0, 0, 0, 0)
        info_row.setSpacing(4)

        prog_label = QLabel(progress_text)
        prog_label.setStyleSheet(f"""
            QLabel {{
                color: {SIDEBAR_TEXT_DIM};
                font-size: 10px;
                font-family: 'Segoe UI', sans-serif;
            }}
        """)
        info_row.addWidget(prog_label)
        info_row.addStretch()
        layout.addLayout(info_row)

        # ── 4. "last read X days ago" text ───────────────────────────
        relative_time = progress_service.format_relative_time(self.last_read)
        time_label = QLabel(relative_time)
        time_label.setStyleSheet(f"""
            QLabel {{
                color: {SIDEBAR_TEXT_DIM};
                font-size: 10px;
                font-style: italic;
            }}
        """)
        layout.addWidget(time_label)

        layout.addStretch()

    def _apply_placeholder(self, label: QLabel) -> None:
        """Styled fallback placeholder when book cover is not available."""
        fmt_icon = "📕" if self.fmt == "EPUB" else "📄" if self.fmt == "PDF" else "📖"
        label.setStyleSheet(f"""
            QLabel {{
                background: {PLACEHOLDER_BG};
                border: 1px solid rgba(196, 179, 138, 0.2);
                border-radius: 6px;
                color: {SIDEBAR_TEXT};
                font-size: 13px;
                font-family: Georgia, serif;
                padding: 10px;
            }}
        """)
        # Show book icon and short title in placeholder
        clean_title = (self.title[:28] + "...") if len(self.title) > 28 else self.title
        label.setText(f"{fmt_icon}\n\n{clean_title}")

    def mousePressEvent(self, event) -> None:
        if event.button() == Qt.MouseButton.LeftButton:
            self.clicked.emit(self.book_id)
        super().mousePressEvent(event)


class LibraryWidget(QWidget):
    """The Library Home Screen displaying books in a responsive card grid."""

    book_opened = pyqtSignal(str)  # emits file_path
    add_book_requested = pyqtSignal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self._cards: list[BookCardWidget] = []
        self._build_ui()
        self.refresh_library()

    def _build_ui(self) -> None:
        self.setStyleSheet(f"background: {OUTER_BG};")
        main_layout = QVBoxLayout(self)
        main_layout.setContentsMargins(0, 0, 0, 0)
        main_layout.setSpacing(0)

        # ── Top Header Bar ───────────────────────────────────────────
        header = QWidget()
        header.setStyleSheet(f"""
            background: {CARD_BG};
            border-bottom: 1px solid {CARD_BORDER};
        """)
        header_layout = QHBoxLayout(header)
        header_layout.setContentsMargins(36, 20, 36, 20)

        # Title & subtitle
        title_box = QVBoxLayout()
        title_box.setSpacing(3)

        lib_title = QLabel("📚  My Library")
        lib_title.setStyleSheet(f"""
            color: {SIDEBAR_ACCENT};
            font-size: 22px;
            font-weight: bold;
            font-family: Georgia, serif;
            letter-spacing: 0.5px;
        """)
        title_box.addWidget(lib_title)

        self.subtitle_label = QLabel("Loading collection...")
        self.subtitle_label.setStyleSheet(f"""
            color: {SIDEBAR_TEXT_DIM};
            font-size: 12px;
            letter-spacing: 1px;
            text-transform: uppercase;
        """)
        title_box.addWidget(self.subtitle_label)
        header_layout.addLayout(title_box)

        header_layout.addStretch()

        # Add Book button
        add_btn = QPushButton("＋  Add book")
        add_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        add_btn.setStyleSheet(f"""
            QPushButton {{
                background: rgba(212, 175, 85, 0.15);
                color: {SIDEBAR_ACCENT};
                border: 1px solid rgba(212, 175, 85, 0.35);
                border-radius: 8px;
                padding: 10px 22px;
                font-size: 13px;
                font-weight: 600;
                letter-spacing: 0.5px;
            }}
            QPushButton:hover {{
                background: rgba(212, 175, 85, 0.28);
                border-color: rgba(212, 175, 85, 0.6);
            }}
            QPushButton:pressed {{
                background: rgba(212, 175, 85, 0.10);
            }}
        """)
        add_btn.clicked.connect(self._on_add_book_clicked)
        header_layout.addWidget(add_btn)
        header_layout.addSpacing(10)

        # Export all books button
        export_all_btn = QPushButton("💾  Export all marks")
        export_all_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        export_all_btn.setToolTip("Export marks for every book into a folder you choose")
        export_all_btn.setStyleSheet(f"""
            QPushButton {{
                background: rgba(212, 175, 85, 0.08);
                color: {SIDEBAR_TEXT};
                border: 1px solid rgba(196, 179, 138, 0.25);
                border-radius: 8px;
                padding: 10px 18px;
                font-size: 13px;
                font-weight: 500;
                letter-spacing: 0.3px;
            }}
            QPushButton:hover {{
                background: rgba(212, 175, 85, 0.18);
                color: {SIDEBAR_ACCENT};
                border-color: rgba(212, 175, 85, 0.45);
            }}
            QPushButton:pressed {{
                background: rgba(212, 175, 85, 0.06);
            }}
        """)
        export_all_btn.clicked.connect(self._on_export_all_clicked)
        header_layout.addWidget(export_all_btn)

        main_layout.addWidget(header)

        # ── Scroll Area for Cards ────────────────────────────────────
        self.scroll_area = QScrollArea()
        self.scroll_area.setWidgetResizable(True)
        self.scroll_area.setFrameShape(QFrame.Shape.NoFrame)
        self.scroll_area.setStyleSheet(f"""
            QScrollArea {{
                background: {OUTER_BG};
                border: none;
            }}
            QScrollBar:vertical {{
                background: {OUTER_BG};
                width: 8px;
                margin: 2px;
                border-radius: 4px;
            }}
            QScrollBar::handle:vertical {{
                background: rgba(196, 179, 138, 0.2);
                min-height: 24px;
                border-radius: 4px;
            }}
            QScrollBar::handle:vertical:hover {{
                background: rgba(196, 179, 138, 0.35);
            }}
            QScrollBar::add-line:vertical,
            QScrollBar::sub-line:vertical {{
                height: 0px;
            }}
        """)

        self.grid_container = QWidget()
        self.grid_container.setStyleSheet(f"background: {OUTER_BG};")
        self.grid_layout = QGridLayout(self.grid_container)
        self.grid_layout.setContentsMargins(36, 28, 36, 28)
        self.grid_layout.setHorizontalSpacing(24)
        self.grid_layout.setVerticalSpacing(28)
        self.grid_layout.setAlignment(Qt.AlignmentFlag.AlignTop | Qt.AlignmentFlag.AlignLeft)

        self.scroll_area.setWidget(self.grid_container)
        main_layout.addWidget(self.scroll_area, 1)

    def refresh_library(self) -> None:
        """Fetch all books from reader.db, sort by last_read newest first, and render cards."""
        # Clear existing layout
        while self.grid_layout.count():
            item = self.grid_layout.takeAt(0)
            widget = item.widget()
            if widget:
                widget.deleteLater()
        self._cards.clear()

        # Fetch books from database
        all_books = db.get_all_books()

        # Sort by last_read, newest first; fall back to added
        def sort_key(b: dict):
            lr = b.get("last_read") or ""
            ad = b.get("added") or ""
            return (lr, ad)

        all_books.sort(key=sort_key, reverse=True)

        count = len(all_books)
        self.subtitle_label.setText(f"{count} {'book' if count == 1 else 'books'} in library")

        if count == 0:
            empty_widget = QWidget()
            empty_layout = QVBoxLayout(empty_widget)
            empty_layout.setAlignment(Qt.AlignmentFlag.AlignCenter)
            empty_layout.setSpacing(12)

            icon_lbl = QLabel("📖")
            icon_lbl.setStyleSheet("font-size: 48px;")
            icon_lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)
            empty_layout.addWidget(icon_lbl)

            msg_lbl = QLabel("Your library is empty")
            msg_lbl.setStyleSheet(f"""
                color: {SIDEBAR_TEXT};
                font-size: 18px;
                font-family: Georgia, serif;
                font-weight: bold;
            """)
            msg_lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)
            empty_layout.addWidget(msg_lbl)

            sub_lbl = QLabel("Click '+ Add book' above to add your favorite PDF or EPUB files.")
            sub_lbl.setStyleSheet(f"color: {SIDEBAR_TEXT_DIM}; font-size: 13px;")
            sub_lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)
            empty_layout.addWidget(sub_lbl)

            self.grid_layout.addWidget(empty_widget, 0, 0, 1, 4)
            return

        # Arrange cards in responsive grid
        cols = max(1, (self.width() - 72) // 220) if self.width() > 200 else 4
        for idx, book in enumerate(all_books):
            card = BookCardWidget(book)
            card.clicked.connect(self._on_card_clicked)
            self._cards.append(card)
            row = idx // cols
            col = idx % cols
            self.grid_layout.addWidget(card, row, col)

    def _on_card_clicked(self, book_id: str) -> None:
        book = db.get_book(book_id)
        if book and book.get("path"):
            self.book_opened.emit(book["path"])

    def _on_add_book_clicked(self) -> None:
        path, _ = QFileDialog.getOpenFileName(
            self,
            "Add book",
            "",
            "Books (*.pdf *.epub);;PDF (*.pdf);;EPUB (*.epub);;All Files (*.*)",
        )
        if path:
            self.book_opened.emit(path)

    def _on_export_all_clicked(self) -> None:
        """Export marks for every book into a user-chosen folder."""
        folder = QFileDialog.getExistingDirectory(
            self, "Choose export folder", "",
            QFileDialog.Option.ShowDirsOnly,
        )
        if not folder:
            return
        try:
            from core.marks_exporter import export_all_books_marks
            results = export_all_books_marks(folder)
        except Exception as exc:
            QMessageBox.critical(self, "Export Failed", f"Could not export marks:\n{exc}")
            return

        if not results:
            QMessageBox.information(
                self, "Export complete",
                "No marks found for any book — nothing to export."
            )
            return

        total_marks = sum(results.values())
        total_books = len(results)
        lines = [f"✓  {title}  ({cnt} mark{'s' if cnt != 1 else ''})" for title, cnt in results.items()]
        detail = "\n".join(lines[:20])
        if len(results) > 20:
            detail += f"\n  ... and {len(results) - 20} more"
        QMessageBox.information(
            self, "Export complete",
            f"Exported {total_marks} mark{'s' if total_marks != 1 else ''} across "
            f"{total_books} book{'s' if total_books != 1 else ''} to:\n{folder}\n\n{detail}",
        )

    def resizeEvent(self, event) -> None:
        super().resizeEvent(event)
        # Re-layout cards dynamically based on available width
        if not self._cards:
            return
        available_w = self.width() - 72
        cols = max(1, available_w // 220)

        # Reposition existing cards in the grid layout
        for idx, card in enumerate(self._cards):
            self.grid_layout.removeWidget(card)
            row = idx // cols
            col = idx % cols
            self.grid_layout.addWidget(card, row, col)
