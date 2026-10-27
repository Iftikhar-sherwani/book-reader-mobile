import fitz
from PyQt6.QtCore import Qt, QPropertyAnimation, QEasingCurve, pyqtSignal, QTimer, QRectF, QPointF, QRect, QSize, QPoint, QEvent
from ui.epub_reader_widget import EpubReaderWidget
from PyQt6.QtGui import (
    QAction,
    QColor,
    QFont,
    QFontDatabase,
    QImage,
    QLinearGradient,
    QPainter,
    QPainterPath,
    QPen,
    QPixmap,
    QTextCharFormat,
    QTextCursor,
)
from PyQt6.QtWidgets import (
    QApplication,
    QFrame,
    QHBoxLayout,
    QLabel,
    QMenu,
    QPushButton,
    QRubberBand,
    QScrollBar,
    QScrollArea,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)

from core import database, settings_manager
from core.models import Highlight, SavedWord

HIGHLIGHT_COLORS = {
    "Yellow": "#FFF3B0",
    "Green": "#B8E6C8",
    "Blue": "#B3D4FC",
    "Pink": "#F8BBD0",
}

# ── Warm book-page color palette ──────────────────────────────────────
PAGE_BG = "#F5ECD7"           # warm parchment
PAGE_TEXT = "#2C2416"          # deep sepia
PAGE_BORDER = "#D4C5A0"       # subtle warm border
SPINE_SHADOW = "#C4B38A"      # book spine shadow
OUTER_BG = "#1E1B16"          # dark surrounding


class BookPageWidget(QFrame):
    """A widget that draws a realistic open-book page with shadow and edge effects."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setObjectName("bookPage")

    def paintEvent(self, event):
        super().paintEvent(event)
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        w, h = self.width(), self.height()

        # Outer shadow glow
        shadow_color = QColor(0, 0, 0, 40)
        for i in range(8):
            painter.setPen(QPen(shadow_color, 1))
            offset = 8 - i
            painter.drawRoundedRect(offset, offset, w - 2 * offset, h - 2 * offset, 4, 4)
            shadow_color.setAlpha(shadow_color.alpha() - 4)

        # Left spine shadow gradient
        spine_grad = QLinearGradient(0, 0, 30, 0)
        spine_grad.setColorAt(0.0, QColor(180, 160, 120, 60))
        spine_grad.setColorAt(1.0, QColor(180, 160, 120, 0))
        painter.fillRect(10, 10, 30, h - 20, spine_grad)

        # Right page edge effect
        edge_grad = QLinearGradient(w - 20, 0, w, 0)
        edge_grad.setColorAt(0.0, QColor(180, 160, 120, 0))
        edge_grad.setColorAt(1.0, QColor(180, 160, 120, 45))
        painter.fillRect(w - 20, 10, 20, h - 20, edge_grad)

        # Top subtle line
        painter.setPen(QPen(QColor(PAGE_BORDER), 1))
        painter.drawLine(15, 12, w - 15, 12)

        painter.end()


class PdfPageView(QLabel):
    """An interactive PDF page widget supporting text selection, highlighting, and vocabulary saving."""
    highlight_added = pyqtSignal()
    word_saved = pyqtSignal()
    mark_added = pyqtSignal()

    def __init__(self, parent=None):
        super().__init__(parent)
        # Requirement 5: The pixmap must be anchored at the top-left
        self.setAlignment(Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignTop)
        self.setMouseTracking(True)

        self.book_id: str | None = None
        self.book_title: str = ""
        self.page_index: int = 0
        self.scale: float = 1.0
        self.pdf_page: fitz.Page | None = None
        self.word_boxes: list[dict] = []
        self._cached_highlights: list = []

        self.is_dragging = False
        self.origin = QPoint()
        self.selected_words: list[dict] = []
        self.selected_text: str = ""

        # Requirement 2: QRubberBand for drag selection
        self.rubber_band = QRubberBand(QRubberBand.Shape.Rectangle, self)
        self.rubber_band.setStyleSheet("""
            QRubberBand {
                background-color: rgba(212, 175, 85, 0.35);
                border: 1px solid #D4AF55;
            }
        """)

    def set_page_data(
        self,
        book_id: str | None,
        page_index: int,
        words: list,
        scale: float,
        pixmap: QPixmap,
        page: fitz.Page | None = None,
        book_title: str = "",
    ):
        """Update page data and cached pixmap only when page/zoom/theme changes."""
        self.book_id = book_id
        self.book_title = book_title
        self.page_index = page_index
        self.scale = scale
        self.pdf_page = page
        self.selected_words = []
        self.selected_text = ""
        self.is_dragging = False
        if self.rubber_band.isVisible():
            self.rubber_band.hide()

        # Anchor pixmap at top-left and ensure widget matches pixmap size
        self.setPixmap(pixmap)
        self.setFixedSize(pixmap.size())

        boxes = []
        for i, w in enumerate(words):
            # w format: (x0, y0, x1, y1, word, block_no, line_no, word_no)
            rect = QRectF(w[0] * scale, w[1] * scale, (w[2] - w[0]) * scale, (w[3] - w[1]) * scale)
            boxes.append({'word': w[4], 'rect': rect, 'idx': i, 'line': w[6]})
        self.word_boxes = boxes

        self._load_highlights()
        self.update()

    def _load_highlights(self):
        if self.book_id:
            try:
                self._cached_highlights = database.get_highlights(self.book_id)
            except Exception:
                self._cached_highlights = []
        else:
            self._cached_highlights = []

    # ── Requirement 5: Coordinate offsets ──────────────────────────────
    def get_pixmap_origin(self) -> QPoint:
        """Return the top-left offset of the rendered pixmap inside this widget."""
        pix = self.pixmap()
        if not pix or pix.isNull():
            return QPoint(0, 0)
        ox = 0
        oy = 0
        if self.alignment() & Qt.AlignmentFlag.AlignHCenter:
            ox = max(0, (self.width() - pix.width()) // 2)
        elif self.alignment() & Qt.AlignmentFlag.AlignRight:
            ox = max(0, self.width() - pix.width())
        if self.alignment() & Qt.AlignmentFlag.AlignVCenter:
            oy = max(0, (self.height() - pix.height()) // 2)
        elif self.alignment() & Qt.AlignmentFlag.AlignBottom:
            oy = max(0, self.height() - pix.height())
        return QPoint(ox, oy)

    def to_pixmap_coords(self, pt: QPoint) -> QPoint:
        """Measure coordinates from pixmap origin, not widget origin."""
        origin = self.get_pixmap_origin()
        return QPoint(pt.x() - origin.x(), pt.y() - origin.y())

    def to_pdf_coords(self, pt: QPoint) -> fitz.Point:
        """Convert widget coordinate to PDF coordinate (divide by zoom factor)."""
        pix_pt = self.to_pixmap_coords(pt)
        s = self.scale if self.scale > 0 else 1.0
        return fitz.Point(pix_pt.x() / s, pix_pt.y() / s)

    def scroll_area_to_pdf_coords(self, scroll_pos: QPoint) -> fitz.Point:
        """If page is centered inside a scroll area/container, subtract that offset."""
        pos_in_label = scroll_pos - self.pos()
        return self.to_pdf_coords(pos_in_label)

    # ── Mouse Interaction ─────────────────────────────────────────────

    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self.origin = event.pos()
            self.is_dragging = True
            pdf_pt = self.to_pdf_coords(self.origin)
            # Requirement 6: Log event type, widget coordinates, PDF coordinates
            print(f"[PDF View] mousePressEvent: widget=({self.origin.x()}, {self.origin.y()}), PDF=({pdf_pt.x:.2f}, {pdf_pt.y:.2f})")
            self.rubber_band.setGeometry(QRect(self.origin, QSize()))
            self.rubber_band.show()
            event.accept()
            return
        super().mousePressEvent(event)

    def mouseMoveEvent(self, event):
        if self.is_dragging and (event.buttons() & Qt.MouseButton.LeftButton):
            curr_pos = event.pos()
            rect = QRect(self.origin, curr_pos).normalized()
            # Requirement 2: Draw selection with QRubberBand
            self.rubber_band.setGeometry(rect)
            pdf_pt = self.to_pdf_coords(curr_pos)
            # Requirement 6: Log event type, widget coordinates, PDF coordinates
            print(f"[PDF View] mouseMoveEvent: widget=({curr_pos.x()}, {curr_pos.y()}), PDF=({pdf_pt.x:.2f}, {pdf_pt.y:.2f})")
            event.accept()
            return
        super().mouseMoveEvent(event)

    def mouseReleaseEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton and self.is_dragging:
            self.is_dragging = False
            self.rubber_band.hide()

            release_pos = event.pos()
            pdf_release = self.to_pdf_coords(release_pos)
            rect = QRect(self.origin, release_pos).normalized()
            drag_dist = (release_pos - self.origin).manhattanLength()

            # Requirement 6: Log event type, widget coordinates, PDF coordinates
            print(f"[PDF View] mouseReleaseEvent: widget=({release_pos.x()}, {release_pos.y()}), PDF=({pdf_release.x:.2f}, {pdf_release.y:.2f}), drag_dist={drag_dist}")

            # Requirement 3: If drag is under 5 pixels, treat as plain click and do nothing
            if drag_dist < 5 or rect.width() < 5 or rect.height() < 5:
                print("[PDF View] Drag under 5 pixels, treating as plain click -> doing nothing.")
                event.accept()
                return

            # Requirement 3: Convert rectangle to PDF coordinates (divide by zoom factor)
            p1 = self.to_pdf_coords(rect.topLeft())
            p2 = self.to_pdf_coords(rect.bottomRight())
            pdf_rect = fitz.Rect(min(p1.x, p2.x), min(p1.y, p2.y), max(p1.x, p2.x), max(p1.y, p2.y))

            # Requirement 3: Read text with page.get_textbox(rect)
            extracted_text = ""
            if self.pdf_page:
                try:
                    extracted_text = self.pdf_page.get_textbox(pdf_rect).strip()
                except Exception as exc:
                    print(f"[PDF View] Error in get_textbox: {exc}")

            # Requirement 6: Log extracted text
            print(f"[PDF View] Extracted text: rect_widget={rect}, rect_pdf=({pdf_rect.x0:.2f}, {pdf_rect.y0:.2f}, {pdf_rect.x1:.2f}, {pdf_rect.y1:.2f}), text='{extracted_text}'")

            # Requirement 3: If text exists, open the mark popup
            if extracted_text:
                self.selected_text = extracted_text
                self._open_mark_dialog(extracted_text)

            event.accept()
            return
        super().mouseReleaseEvent(event)

    def mouseDoubleClickEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            click_pos = event.pos()
            pdf_pt = self.to_pdf_coords(click_pos)
            # Requirement 6: Log event type, widget coordinates, PDF coordinates
            print(f"[PDF View] mouseDoubleClickEvent: widget=({click_pos.x()}, {click_pos.y()}), PDF=({pdf_pt.x:.2f}, {pdf_pt.y:.2f})")

            # Requirement 4: On double-click, convert click point to PDF coordinates,
            # call page.get_text("words"), and find the word whose rectangle contains the point.
            matched_word = None
            if self.pdf_page:
                try:
                    words = self.pdf_page.get_text("words")
                except Exception as exc:
                    print(f"[PDF View] Error calling get_text('words'): {exc}")
                    words = []

                for w in words:
                    # w format: (x0, y0, x1, y1, word, block_no, line_no, word_no)
                    if w[0] <= pdf_pt.x <= w[2] and w[1] <= pdf_pt.y <= w[3]:
                        matched_word = w[4]
                        break

                if not matched_word:
                    # Small tolerance (4 pt) in case of near miss
                    min_dist = 9999.0
                    for w in words:
                        if (w[0] - 4) <= pdf_pt.x <= (w[2] + 4) and (w[1] - 4) <= pdf_pt.y <= (w[3] + 4):
                            dist = min(abs(pdf_pt.x - (w[0] + w[2]) / 2), abs(pdf_pt.y - (w[1] + w[3]) / 2))
                            if dist < min_dist:
                                min_dist = dist
                                matched_word = w[4]

            clean_word = ""
            if matched_word:
                import string
                # Requirement 4: Strip punctuation
                clean_word = matched_word.strip(string.punctuation + "“”‘’—–…\u200b \t\r\n")

            # Requirement 6: Log extracted word
            print(f"[PDF View] Double-click word found: raw='{matched_word}', clean='{clean_word}'")

            # Requirement 4: Open dictionary popup for that word
            if clean_word:
                from ui.dictionary_dialog import DictionaryPopupDialog
                dlg = DictionaryPopupDialog(word=clean_word, book_title=self.book_title, parent=self)
                dlg.word_saved.connect(self.word_saved.emit)
                dlg.exec()
                event.accept()
                return

        super().mouseDoubleClickEvent(event)

    def _open_mark_dialog(self, text: str) -> None:
        """Open the mark dialog for the extracted quote text."""
        from ui.mark_dialog import MarkDialog
        dlg = MarkDialog(quote=text, parent=self)
        if dlg.exec():
            if getattr(dlg, "action", "mark") == "vocab":
                import string
                quote, _, _ = dlg.get_data()
                target_text = quote.strip() if quote.strip() else text.strip()
                clean_word = target_text.strip(string.punctuation + "“”‘’—–…\u200b \t\r\n")
                if clean_word:
                    from ui.dictionary_dialog import DictionaryPopupDialog
                    dict_dlg = DictionaryPopupDialog(word=clean_word, book_title=self.book_title, parent=self)
                    dict_dlg.word_saved.connect(self.word_saved.emit)
                    dict_dlg.exec()
                return

            quote, note, color = dlg.get_data()
            if quote:
                import db
                loc = f"{self.page_index}|0"
                db.add_mark(
                    book_id=self.book_id or "",
                    loc=loc,
                    quote=quote,
                    note=note,
                    color=color,
                )
                hl = Highlight(
                    id=0,
                    book_id=self.book_id or "",
                    start_pos=0,
                    end_pos=0,
                    color=color,
                    text=quote[:500],
                    page_index=self.page_index,
                )
                database.add_highlight(hl)
                self._load_highlights()
                self.update()
                self.mark_added.emit()
                self.highlight_added.emit()

    def contextMenuEvent(self, event):
        has_selection = bool(self.selected_text)
        menu = QMenu(self)
        menu.setStyleSheet("""
            QMenu {
                background: #2A2520;
                color: #E8DCC6;
                border: 1px solid rgba(196, 179, 138, 0.3);
                border-radius: 8px;
                padding: 6px 4px;
                font-size: 13px;
            }
            QMenu::item {
                padding: 8px 28px 8px 16px;
                border-radius: 4px;
                margin: 2px 4px;
            }
            QMenu::item:selected {
                background: rgba(196, 179, 138, 0.2);
            }
            QMenu::separator {
                height: 1px;
                background: rgba(196, 179, 138, 0.15);
                margin: 4px 12px;
            }
        """)

        if has_selection:
            highlight_menu = menu.addMenu("✦  Highlight")
            highlight_menu.setStyleSheet(menu.styleSheet())
            for name, color in HIGHLIGHT_COLORS.items():
                action = highlight_menu.addAction(f"{name}")
                action.triggered.connect(lambda checked, c=color: self.add_highlight(c))

            save_action = QAction("📖  Save to Vocabulary", self)
            save_action.triggered.connect(self.save_selected_word)
            menu.addAction(save_action)

            menu.addSeparator()

        copy_action = menu.addAction("📋  Copy")
        copy_action.setEnabled(has_selection)
        copy_action.triggered.connect(self.copy_selection)

        menu.exec(event.globalPos())

    def copy_selection(self):
        if self.selected_text:
            QApplication.clipboard().setText(self.selected_text)

    def add_highlight(self, color: str = HIGHLIGHT_COLORS["Yellow"]):
        if not self.book_id or not self.selected_text:
            return
        hl = Highlight(
            id=0,
            book_id=self.book_id,
            start_pos=0,
            end_pos=0,
            color=color,
            text=self.selected_text[:500],
            page_index=self.page_index,
        )
        database.add_highlight(hl)
        self._load_highlights()
        self.update()
        self.highlight_added.emit()

    def save_selected_word(self):
        if not self.selected_text:
            return
        import string
        clean_word = self.selected_text.strip().strip(string.punctuation + "“”‘’—–…\u200b \t\r\n")
        if not clean_word:
            return

        from ui.dictionary_dialog import DictionaryPopupDialog
        dlg = DictionaryPopupDialog(word=clean_word, book_title=self.book_title, parent=self)
        dlg.word_saved.connect(self.word_saved.emit)
        dlg.exec()

    def paintEvent(self, event):
        super().paintEvent(event)
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)

        # Draw saved highlights for this PDF page
        if self.book_id and self.page_index is not None and self._cached_highlights:
            for hl in self._cached_highlights:
                if hl.page_index == self.page_index:
                    color = QColor(hl.color)
                    color.setAlpha(110)
                    painter.setBrush(color)
                    painter.setPen(Qt.PenStyle.NoPen)

                    rects_to_draw = []
                    if 0 <= hl.start_pos <= hl.end_pos and hl.start_pos < len(self.word_boxes) and (hl.start_pos != 0 or hl.end_pos != 0):
                        for wb in self.word_boxes:
                            if hl.start_pos <= wb['idx'] <= hl.end_pos:
                                rects_to_draw.append(wb['rect'])
                    else:
                        hl_text_words = set(hl.text.lower().split())
                        for wb in self.word_boxes:
                            if wb['word'].lower() in hl_text_words:
                                rects_to_draw.append(wb['rect'])

                    for r in rects_to_draw:
                        painter.drawRoundedRect(r, 2, 2)

        painter.end()


class ReaderWidget(QWidget):
    highlight_added = pyqtSignal()
    word_saved = pyqtSignal()
    mark_added = pyqtSignal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self.book_id: str | None = None
        self.book_format: str = "txt"
        self.file_path: str = ""
        self._full_content = ""
        self._is_html = False
        self._is_pdf = False
        self._is_epub = False
        self._current_page = 0
        self._total_pages = 0
        self._pages: list[str] = []
        self._chars_per_page = 3000  # characters per page for pagination

        self._pdf_doc: fitz.Document | None = None
        self._zoom_scale: float = 1.25
        self._fit_width: bool = True

        # Requirement 1: Keep the rendered QPixmap in memory and reuse it
        self._cached_pixmap: QPixmap | None = None
        self._cached_page: int | None = None
        self._cached_scale: float | None = None
        self._cached_theme: str | None = None
        self._cached_doc: fitz.Document | None = None

        self._epub_chapters: list[str] = []
        self.theme: str = settings_manager.get_setting("theme", "Sepia")

        self._build_ui()

    def _build_ui(self):
        self.setStyleSheet(f"background: {OUTER_BG};")
        main_layout = QVBoxLayout(self)
        main_layout.setContentsMargins(30, 20, 30, 10)
        main_layout.setSpacing(0)

        # ── The book page container ───────────────────────────────────
        self.book_page = BookPageWidget()
        self.book_page.setStyleSheet(f"""
            #bookPage {{
                background: {PAGE_BG};
                border: 1px solid {PAGE_BORDER};
                border-radius: 4px;
            }}
        """)

        page_layout = QVBoxLayout(self.book_page)
        page_layout.setContentsMargins(0, 0, 0, 0)
        page_layout.setSpacing(0)

        # ── Text area ────────────────────────────────────────────────
        self.text_area = QTextEdit()
        self.text_area.setReadOnly(True)
        self.text_area.setFrameShape(QFrame.Shape.NoFrame)
        self.text_area.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAsNeeded)
        self.text_area.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.text_area.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
        self.text_area.customContextMenuRequested.connect(self._show_context_menu)

        preferred_fonts = ["Literata", "Merriweather", "Crimson Text", "Georgia", "Palatino Linotype", "Book Antiqua", "Garamond", "Times New Roman"]
        chosen_font = "Georgia"
        available = QFontDatabase.families()
        for f in preferred_fonts:
            if f in available:
                chosen_font = f
                break

        self.text_area.setFont(QFont(chosen_font, 13))
        self.text_area.setStyleSheet(f"""
            QTextEdit {{
                background: {PAGE_BG};
                color: {PAGE_TEXT};
                border: none;
                padding: 40px 55px 30px 55px;
                selection-background-color: rgba(212, 175, 85, 0.35);
                selection-color: {PAGE_TEXT};
            }}
            QScrollBar:vertical {{
                background: {PAGE_BG};
                width: 8px;
                margin: 4px 2px 4px 0px;
                border-radius: 4px;
            }}
            QScrollBar::handle:vertical {{
                background: {SPINE_SHADOW};
                min-height: 30px;
                border-radius: 4px;
            }}
            QScrollBar::handle:vertical:hover {{
                background: #A89870;
            }}
            QScrollBar::add-line:vertical,
            QScrollBar::sub-line:vertical {{
                height: 0px;
            }}
            QScrollBar::add-page:vertical,
            QScrollBar::sub-page:vertical {{
                background: none;
            }}
        """)

        page_layout.addWidget(self.text_area)

        # ── PDF Scroll Area ──────────────────────────────────────────
        self.pdf_scroll = QScrollArea()
        self.pdf_scroll.setFrameShape(QFrame.Shape.NoFrame)
        self.pdf_scroll.setWidgetResizable(True)
        self.pdf_scroll.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.pdf_scroll.setStyleSheet(f"""
            QScrollArea {{
                background: {PAGE_BG};
                border: none;
            }}
            QScrollBar:vertical {{
                background: {PAGE_BG};
                width: 8px;
                margin: 4px 2px 4px 0px;
                border-radius: 4px;
            }}
            QScrollBar::handle:vertical {{
                background: {SPINE_SHADOW};
                min-height: 30px;
                border-radius: 4px;
            }}
            QScrollBar::handle:vertical:hover {{
                background: #A89870;
            }}
            QScrollBar:horizontal {{
                background: {PAGE_BG};
                height: 8px;
                margin: 0px 4px 2px 4px;
                border-radius: 4px;
            }}
            QScrollBar::handle:horizontal {{
                background: {SPINE_SHADOW};
                min-width: 30px;
                border-radius: 4px;
            }}
        """)

        self.pdf_container = QWidget()
        self.pdf_container.setStyleSheet(f"background: {PAGE_BG};")
        pdf_layout = QVBoxLayout(self.pdf_container)
        pdf_layout.setContentsMargins(20, 20, 20, 20)
        pdf_layout.setAlignment(Qt.AlignmentFlag.AlignCenter)

        self.pdf_label = PdfPageView()
        self.pdf_label.highlight_added.connect(self.highlight_added.emit)
        self.pdf_label.word_saved.connect(self.word_saved.emit)
        self.pdf_label.mark_added.connect(self.mark_added.emit)
        pdf_layout.addWidget(self.pdf_label)

        self.pdf_scroll.setWidget(self.pdf_container)
        self.pdf_scroll.hide()

        page_layout.addWidget(self.pdf_scroll)

        # ── EPUB WebEngine View ──────────────────────────────────────
        self.epub_widget = EpubReaderWidget()
        self.epub_widget.mark_added.connect(self.mark_added.emit)
        self.epub_widget.word_saved.connect(self.word_saved.emit)
        self.epub_widget.hide()

        main_layout.addWidget(self.book_page, 1)
        main_layout.addWidget(self.epub_widget, 1)

        # ── Bottom navigation bar ────────────────────────────────────
        nav_bar = QWidget()
        nav_bar.setStyleSheet("background: transparent;")
        nav_layout = QHBoxLayout(nav_bar)
        nav_layout.setContentsMargins(10, 8, 10, 4)

        btn_style = """
            QPushButton {
                background: rgba(245, 236, 215, 0.12);
                color: #C4B38A;
                border: 1px solid rgba(196, 179, 138, 0.25);
                border-radius: 6px;
                padding: 8px 22px;
                font-size: 13px;
                font-weight: 500;
                letter-spacing: 0.5px;
            }
            QPushButton:hover {
                background: rgba(245, 236, 215, 0.22);
                color: #E8DCC6;
                border-color: rgba(196, 179, 138, 0.5);
            }
            QPushButton:pressed {
                background: rgba(245, 236, 215, 0.08);
            }
            QPushButton:disabled {
                color: rgba(196, 179, 138, 0.3);
                border-color: rgba(196, 179, 138, 0.1);
                background: transparent;
            }
        """

        self.prev_btn = QPushButton("◂  Previous")
        self.prev_btn.setStyleSheet(btn_style)
        self.prev_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.prev_btn.clicked.connect(self._prev_page)
        nav_layout.addWidget(self.prev_btn)

        nav_layout.addStretch()

        self.page_label = QLabel("")
        self.page_label.setStyleSheet("""
            color: #8A7D66;
            font-size: 12px;
            font-family: 'Segoe UI', sans-serif;
            letter-spacing: 1.5px;
        """)
        self.page_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        nav_layout.addWidget(self.page_label)

        nav_layout.addStretch()

        # Zoom controls widget (visible for PDF format)
        self.zoom_widget = QWidget()
        zoom_layout = QHBoxLayout(self.zoom_widget)
        zoom_layout.setContentsMargins(0, 0, 0, 0)
        zoom_layout.setSpacing(6)

        zoom_btn_style = """
            QPushButton {
                background: rgba(245, 236, 215, 0.12);
                color: #C4B38A;
                border: 1px solid rgba(196, 179, 138, 0.25);
                border-radius: 6px;
                padding: 6px 14px;
                font-size: 13px;
                font-weight: 500;
            }
            QPushButton:hover {
                background: rgba(245, 236, 215, 0.22);
                color: #E8DCC6;
                border-color: rgba(196, 179, 138, 0.5);
            }
        """

        self.zoom_out_btn = QPushButton("－")
        self.zoom_out_btn.setStyleSheet(zoom_btn_style)
        self.zoom_out_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.zoom_out_btn.setToolTip("Zoom Out")
        self.zoom_out_btn.clicked.connect(self._zoom_out)
        zoom_layout.addWidget(self.zoom_out_btn)

        self.zoom_fit_btn = QPushButton("Fit Width")
        self.zoom_fit_btn.setStyleSheet(zoom_btn_style)
        self.zoom_fit_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.zoom_fit_btn.setToolTip("Fit page to window width")
        self.zoom_fit_btn.clicked.connect(self._zoom_fit_width)
        zoom_layout.addWidget(self.zoom_fit_btn)

        self.zoom_in_btn = QPushButton("＋")
        self.zoom_in_btn.setStyleSheet(zoom_btn_style)
        self.zoom_in_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.zoom_in_btn.setToolTip("Zoom In")
        self.zoom_in_btn.clicked.connect(self._zoom_in)
        zoom_layout.addWidget(self.zoom_in_btn)

        self.finish_chap_btn = QPushButton("Finish chapter")
        self.finish_chap_btn.setStyleSheet(zoom_btn_style)
        self.finish_chap_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.finish_chap_btn.setToolTip("Record an action step for this chapter/page")
        self.finish_chap_btn.clicked.connect(self._on_finish_chapter_clicked)
        zoom_layout.addWidget(self.finish_chap_btn)

        self.zoom_widget.hide()
        nav_layout.addWidget(self.zoom_widget)

        self.next_btn = QPushButton("Next  ▸")
        self.next_btn.setStyleSheet(btn_style)
        self.next_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.next_btn.clicked.connect(self._next_page)
        nav_layout.addWidget(self.next_btn)

        main_layout.addWidget(nav_bar)

    # ── Content loading & pagination ──────────────────────────────────

    def load_content(self, book_id: str, content: str, is_html: bool, book_format: str = "txt", file_path: str = "", epub_chapters: list[str] | None = None) -> None:
        self.book_id = book_id
        self.book_format = book_format
        self.file_path = file_path or content
        self._full_content = content
        self._is_html = (book_format == "epub" or is_html)
        self._is_pdf = (book_format == "pdf")
        self._is_epub = (book_format == "epub")
        self._epub_chapters = epub_chapters or []

        if self._pdf_doc:
            try:
                self._pdf_doc.close()
            except Exception:
                pass
            self._pdf_doc = None

        self._cached_pixmap = None
        self._cached_page = None
        self._cached_scale = None
        self._cached_theme = None
        self._cached_doc = None

        if self._is_epub and self._epub_chapters:
            # ── EPUB: delegate to EpubReaderWidget ───────────────────
            self.text_area.hide()
            self.pdf_scroll.hide()
            self.zoom_widget.hide()
            self.book_page.hide()
            self.epub_widget.show()
            self.epub_widget.load_chapters(book_id, self._epub_chapters)
            self._total_pages = len(self._epub_chapters)
            self._current_page = 0
        elif self._is_pdf:
            self.epub_widget.hide()
            self.book_page.show()
            self.text_area.hide()
            self.pdf_scroll.show()
            self.zoom_widget.show()
            target_path = self.file_path
            try:
                self._pdf_doc = fitz.open(target_path)
                self._total_pages = len(self._pdf_doc)
            except Exception as exc:
                self._total_pages = 1
                self.pdf_label.setText(f"Could not open PDF:\n{exc}")
            self._current_page = 0
            self._show_current_page()
        else:
            self.epub_widget.hide()
            self.book_page.show()
            self.pdf_scroll.hide()
            self.zoom_widget.hide()
            self.text_area.show()
            self._paginate()
            self._current_page = 0
            self._show_current_page()

    def _paginate(self) -> None:
        """Split content into pages for a book-like reading experience."""
        content = self._full_content
        if not content:
            self._pages = [""]
            self._total_pages = 1
            return

        if self._is_html:
            from PyQt6.QtGui import QTextDocument
            doc = QTextDocument()
            doc.setHtml(content)
            plain = doc.toPlainText()
        else:
            plain = content

        pages = []
        remaining = plain if not self._is_html else content
        chars = self._chars_per_page

        if self._is_html:
            paragraphs = content.split("</p>")
            current_chunk = ""
            for p in paragraphs:
                test = current_chunk + p + "</p>"
                text_len = len(p.replace("<", " ").replace(">", " "))
                if len(current_chunk) > 0 and len(current_chunk) + text_len > chars:
                    pages.append(current_chunk)
                    current_chunk = p + "</p>"
                else:
                    current_chunk = test
            if current_chunk.strip():
                pages.append(current_chunk)
        else:
            paragraphs = content.split("\n\n")
            current_chunk = ""
            for p in paragraphs:
                if len(current_chunk) > 0 and len(current_chunk) + len(p) + 2 > chars:
                    pages.append(current_chunk)
                    current_chunk = p
                else:
                    if current_chunk:
                        current_chunk += "\n\n" + p
                    else:
                        current_chunk = p
            if current_chunk.strip():
                pages.append(current_chunk)

        self._pages = pages if pages else [""]
        self._total_pages = len(self._pages)

    def _show_current_page(self) -> None:
        if self._is_pdf:
            self._show_pdf_page()
            self._update_nav()
            return

        if not self._pages:
            return

        page_content = self._pages[self._current_page]

        if self._is_html:
            styled_html = f"""
            <div style="
                font-family: Georgia, 'Palatino Linotype', serif;
                font-size: 14px;
                line-height: 1.85;
                color: {PAGE_TEXT};
                text-align: justify;
                text-indent: 28px;
            ">
            {page_content}
            </div>
            """
            self.text_area.setHtml(styled_html)
        else:
            paragraphs = page_content.split("\n\n")
            html_parts = []
            for para in paragraphs:
                para = para.strip()
                if not para:
                    continue

                lines = para.split("\n")
                is_heading = False
                if len(lines) <= 2 and len(para) < 80:
                    upper = para.strip().upper()
                    if (
                        not para.endswith(".")
                        and not para.endswith(",")
                        and (
                            para.isupper()
                            or para.startswith("Chapter ")
                            or para.startswith("CHAPTER ")
                            or para.startswith("Part ")
                            or para.startswith("PART ")
                            or para.startswith("Section ")
                            or upper.startswith("DEDICATION")
                            or upper.startswith("ACKNOWLEDGMENT")
                            or upper.startswith("PREFACE")
                            or upper.startswith("FOREWORD")
                            or upper.startswith("INTRODUCTION")
                            or upper.startswith("CONTENTS")
                            or upper.startswith("EPILOGUE")
                            or upper.startswith("APPENDIX")
                            or upper.startswith("CONCLUSION")
                            or upper.startswith("INDEX")
                            or (len(para) < 50 and not para.endswith(".") and len(lines) == 1)
                        )
                    ):
                        is_heading = True

                if is_heading:
                    text = para.replace("\n", "<br/>")
                    html_parts.append(f"""
                        <p style="
                            font-family: Georgia, 'Palatino Linotype', serif;
                            font-size: 20px;
                            font-weight: bold;
                            color: #5C4A2A;
                            text-align: center;
                            margin: 35px 0 20px 0;
                            letter-spacing: 2px;
                            text-transform: uppercase;
                            border-bottom: 1px solid {PAGE_BORDER};
                            padding-bottom: 12px;
                        ">{text}</p>
                    """)
                else:
                    text = para.replace("\n", " ")
                    html_parts.append(f"""
                        <p style="
                            font-family: Georgia, 'Palatino Linotype', serif;
                            font-size: 14px;
                            line-height: 1.85;
                            color: {PAGE_TEXT};
                            text-align: justify;
                            text-indent: 28px;
                            margin: 12px 0;
                        ">{text}</p>
                    """)

            full_html = f"""
            <div style="padding: 10px 0;">
                {''.join(html_parts)}
            </div>
            """
            self.text_area.setHtml(full_html)

        self.text_area.verticalScrollBar().setValue(0)
        self._apply_highlights()
        self._update_nav()

    def _get_book_title(self) -> str:
        if self.book_id:
            try:
                import db
                raw = db.get_book(self.book_id)
                if raw:
                    return raw.get("title", "")
            except Exception:
                pass
        return ""

    def _show_pdf_page(self, force: bool = False) -> None:
        if not self._pdf_doc or self._total_pages == 0:
            return

        if self._current_page < 0:
            self._current_page = 0
        elif self._current_page >= self._total_pages:
            self._current_page = self._total_pages - 1

        try:
            page = self._pdf_doc.load_page(self._current_page)
            rect = page.rect

            if self._fit_width:
                viewport_w = self.pdf_scroll.viewport().width() - 50
                if viewport_w > 100:
                    scale = viewport_w / rect.width
                else:
                    scale = self._zoom_scale
            else:
                scale = self._zoom_scale

            scale = max(0.2, min(scale, 5.0))
            theme = getattr(self, "theme", "Sepia")

            page_changed = (self._current_page != self._cached_page)
            scale_changed = (self._cached_scale is None or abs(scale - self._cached_scale) > 0.005)
            theme_changed = (theme != self._cached_theme)
            doc_changed = (self._pdf_doc != self._cached_doc)

            # Requirement 1: Render ONLY when the page number, zoom, or theme changes.
            # Keep the rendered QPixmap in memory and reuse it. Mouse press, move, and release
            # must never trigger a re-render or a new setPixmap call.
            if not force and not page_changed and not scale_changed and not theme_changed and not doc_changed and self._cached_pixmap is not None:
                return

            pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
            img = QImage(pix.samples, pix.width, pix.height, pix.stride, QImage.Format.Format_RGB888).copy()

            # Apply theme tint for PDF (Feature 12)
            if theme == "Dark":
                img.invertPixels()
                p = QPainter(img)
                p.setCompositionMode(QPainter.CompositionMode.CompositionMode_Multiply)
                p.fillRect(img.rect(), QColor(230, 220, 200))
                p.end()
            elif theme == "Sepia":
                p = QPainter(img)
                p.setCompositionMode(QPainter.CompositionMode.CompositionMode_Multiply)
                p.fillRect(img.rect(), QColor(245, 236, 215))
                p.end()

            qpix = QPixmap.fromImage(img)

            # Keep rendered pixmap in memory
            self._cached_pixmap = qpix
            self._cached_page = self._current_page
            self._cached_scale = scale
            self._cached_theme = theme
            self._cached_doc = self._pdf_doc

            words = page.get_text("words")
            self.pdf_label.set_page_data(
                book_id=self.book_id,
                page_index=self._current_page,
                words=words,
                scale=scale,
                pixmap=qpix,
                page=page,
                book_title=self._get_book_title(),
            )

            if page_changed:
                self.pdf_scroll.verticalScrollBar().setValue(0)
        except Exception as exc:
            self.pdf_label.setText(f"Error rendering page: {exc}")

    def _zoom_in(self) -> None:
        if not self._is_pdf:
            return
        self._fit_width = False
        self._zoom_scale = min(self._zoom_scale * 1.25, 4.0)
        self._show_pdf_page()

    def _zoom_out(self) -> None:
        if not self._is_pdf:
            return
        self._fit_width = False
        self._zoom_scale = max(self._zoom_scale / 1.25, 0.4)
        self._show_pdf_page()

    def _zoom_fit_width(self) -> None:
        if not self._is_pdf:
            return
        self._fit_width = True
        self._show_pdf_page()

    def _on_finish_chapter_clicked(self) -> None:
        """Trigger chapter action step dialog for PDF."""
        from ui.action_dialog import ChapterActionDialog
        book_title = ""
        if self.book_id:
            raw = db.get_book(self.book_id)
            if raw:
                book_title = raw.get("title", "")
        dlg = ChapterActionDialog(
            book_id=self.book_id or "",
            loc=str(self._current_page),
            book_title=book_title,
            parent=self,
        )
        dlg.exec()

    def set_theme(self, theme: str) -> None:
        """Switch reading theme (Light, Sepia, Dark)."""
        self.theme = theme
        if self._is_epub:
            self.epub_widget.set_theme(theme)
        elif self._is_pdf:
            self._show_pdf_page()
        else:
            self._show_current_page()

    def set_font_size(self, size: int) -> None:
        """Adjust font size for EPUB."""
        if self._is_epub:
            self.epub_widget.set_font_size(size)

    def set_line_width(self, width: int) -> None:
        """Adjust line width for EPUB."""
        if self._is_epub:
            self.epub_widget.set_line_width(width)

    def resizeEvent(self, event):
        super().resizeEvent(event)
        if self._is_pdf and self._fit_width:
            self._show_pdf_page()

    def _update_nav(self):
        self.page_label.setText(f"PAGE  {self._current_page + 1}  OF  {self._total_pages}")
        self.prev_btn.setEnabled(self._current_page > 0)
        self.next_btn.setEnabled(self._current_page < self._total_pages - 1)

    def _next_page(self):
        if self._current_page < self._total_pages - 1:
            self._current_page += 1
            self._show_current_page()

    def _prev_page(self):
        if self._current_page > 0:
            self._current_page -= 1
            self._show_current_page()

    # ── Scroll / position helpers ─────────────────────────────────────

    def restore_scroll(self, offset: int) -> None:
        """Restore reading position. The offset encodes page + scroll."""
        if self._is_epub:
            self.epub_widget.restore_reading_position()
            return
        if self._total_pages == 0:
            return
        page = offset // 100000
        scroll = offset % 100000
        self.go_to_page_and_scroll(page, scroll)

    def get_scroll_offset(self) -> int:
        """Encode current page + scroll position."""
        if self._is_epub:
            # For EPUB, the position is saved directly in epub_widget via save_reading_position
            return 0  # Not used for EPUB, position is saved in 'chapter|scroll' format
        if self._is_pdf:
            scroll_val = self.pdf_scroll.verticalScrollBar().value()
        else:
            scroll_val = self.text_area.verticalScrollBar().value()
        return self._current_page * 100000 + scroll_val

    def save_epub_position(self) -> None:
        """Save EPUB reading position (chapter + scroll Y) via the epub widget."""
        if self._is_epub:
            self.epub_widget.save_reading_position()

    def get_current_page_index(self) -> int:
        if self._is_epub:
            return self.epub_widget.current_chapter_index()
        return self._current_page

    def get_current_scroll_val(self) -> int:
        if self._is_pdf:
            return self.pdf_scroll.verticalScrollBar().value()
        else:
            return self.text_area.verticalScrollBar().value()

    def get_page_snippet(self) -> str:
        if self._is_epub:
            return self.epub_widget.get_chapter_snippet()
        if self._is_pdf:
            if self._pdf_doc and 0 <= self._current_page < self._total_pages:
                try:
                    text = self._pdf_doc.load_page(self._current_page).get_text("text").strip()
                    lines = [l.strip() for l in text.splitlines() if l.strip()]
                    if lines:
                        return lines[0][:50]
                except Exception:
                    pass
            return f"Page {self._current_page + 1}"
        else:
            if 0 <= self._current_page < len(self._pages):
                text = self.text_area.toPlainText().strip()
                lines = [l.strip() for l in text.splitlines() if l.strip()]
                if lines:
                    return lines[0][:50]
            return f"Page {self._current_page + 1}"

    def go_to_page_and_scroll(self, page_index: int, scroll_offset: int = 0) -> None:
        if 0 <= page_index < self._total_pages:
            self._current_page = page_index
            self._show_current_page()
            if self._is_pdf:
                QTimer.singleShot(100, lambda: self.pdf_scroll.verticalScrollBar().setValue(
                    min(scroll_offset, self.pdf_scroll.verticalScrollBar().maximum())
                ))
            else:
                QTimer.singleShot(100, lambda: self.text_area.verticalScrollBar().setValue(
                    min(scroll_offset, self.text_area.verticalScrollBar().maximum())
                ))


    def show_position(self, pos: int) -> None:
        if self._is_pdf:
            return
        offset = 0
        for i, page in enumerate(self._pages):
            if offset + len(page) >= pos:
                self._current_page = i
                self._show_current_page()
                local_pos = pos - offset
                cursor = QTextCursor(self.text_area.document())
                cursor.setPosition(min(local_pos, self.text_area.document().characterCount() - 1))
                self.text_area.setTextCursor(cursor)
                self.text_area.ensureCursorVisible()
                return
            offset += len(page)

    def show_word(self, word: str) -> None:
        if self._is_pdf and self._pdf_doc:
            for i in range(self._total_pages):
                try:
                    p = self._pdf_doc.load_page(i)
                    words_text = p.get_text("text")
                    if word.lower() in words_text.lower():
                        self._current_page = i
                        self._show_current_page()
                        # Select the matching word on the PDF page
                        for wb in self.pdf_label.word_boxes:
                            if word.lower() in wb['word'].lower():
                                self.pdf_label.selected_words = [wb]
                                self.pdf_label.selected_text = wb['word']
                                self.pdf_label.update()
                                break
                        return
                except Exception:
                    pass
            return

        for i, page in enumerate(self._pages):
            if word.lower() in page.lower():
                self._current_page = i
                self._show_current_page()
                full = self.text_area.toPlainText()
                idx = full.lower().find(word.lower())
                if idx >= 0:
                    cursor = QTextCursor(self.text_area.document())
                    cursor.setPosition(idx)
                    self.text_area.setTextCursor(cursor)
                    self.text_area.ensureCursorVisible()
                return

    def go_to_page_and_pos(self, page_index: int, pos: int) -> None:
        if 0 <= page_index < self._total_pages:
            self._current_page = page_index
            self._show_current_page()
            if not self._is_pdf:
                doc_len = self.text_area.document().characterCount()
                cursor = QTextCursor(self.text_area.document())
                cursor.setPosition(min(pos, max(0, doc_len - 1)))
                self.text_area.setTextCursor(cursor)
                self.text_area.ensureCursorVisible()

    # ── Highlights ────────────────────────────────────────────────────

    def _apply_highlights(self) -> None:
        if not self.book_id or self._is_pdf:
            return
        for hl in database.get_highlights(self.book_id):
            if hl.page_index == self._current_page:
                self._apply_format(hl.start_pos, hl.end_pos, hl.color)

    def _apply_format(self, start: int, end: int, color: str) -> None:
        if self._is_pdf:
            return
        doc_length = self.text_area.document().characterCount()
        if start >= doc_length or end > doc_length:
            return
        cursor = QTextCursor(self.text_area.document())
        cursor.setPosition(start)
        cursor.setPosition(min(end, doc_length - 1), QTextCursor.MoveMode.KeepAnchor)
        fmt = QTextCharFormat()
        fmt.setBackground(QColor(color))
        cursor.mergeCharFormat(fmt)

    def _selected_range(self) -> tuple[int, int, str] | None:
        if self._is_pdf:
            if self.pdf_label.selected_text:
                return 0, 0, self.pdf_label.selected_text
            return None
        cursor = self.text_area.textCursor()
        if not cursor.hasSelection():
            return None
        start = cursor.selectionStart()
        end = cursor.selectionEnd()
        text = cursor.selectedText().replace("\u2029", "\n")
        return start, end, text

    def _context_sentence(self, word: str) -> str:
        if self._is_pdf:
            return word
        full = self.text_area.toPlainText()
        idx = full.lower().find(word.lower())
        if idx == -1:
            return word
        start = max(0, full.rfind(".", 0, idx) + 1)
        end = full.find(".", idx)
        if end == -1:
            end = min(len(full), idx + 120)
        else:
            end += 1
        return full[start:end].strip()

    def add_highlight(self, color: str = HIGHLIGHT_COLORS["Yellow"]) -> None:
        if self._is_pdf:
            self.pdf_label.add_highlight(color)
            return
        if not self.book_id:
            return
        sel = self._selected_range()
        if not sel:
            return
        start, end, text = sel
        hl = Highlight(
            id=0,
            book_id=self.book_id,
            start_pos=start,
            end_pos=end,
            color=color,
            text=text[:500],
            page_index=self._current_page,
        )
        database.add_highlight(hl)
        self._apply_format(start, end, color)
        self.highlight_added.emit()

    def save_selected_word(self) -> None:
        if self._is_pdf:
            self.pdf_label.save_selected_word()
            return
        if not self.book_id:
            return
        sel = self._selected_range()
        if not sel:
            return
        _, _, text = sel
        import string
        clean_word = text.strip().strip(string.punctuation + "“”‘’—–…\u200b \t\r\n")
        if not clean_word:
            return
        from ui.dictionary_dialog import DictionaryPopupDialog
        dlg = DictionaryPopupDialog(word=clean_word, book_title=getattr(self, "book_title", ""), parent=self)
        dlg.word_saved.connect(self.word_saved.emit)
        dlg.exec()

    # ── Context menu ──────────────────────────────────────────────────

    def _show_context_menu(self, pos) -> None:
        if self._is_pdf:
            return
        menu = QMenu(self.text_area)
        menu.setStyleSheet(f"""
            QMenu {{
                background: #2A2520;
                color: #E8DCC6;
                border: 1px solid rgba(196, 179, 138, 0.3);
                border-radius: 8px;
                padding: 6px 4px;
                font-size: 13px;
            }}
            QMenu::item {{
                padding: 8px 28px 8px 16px;
                border-radius: 4px;
                margin: 2px 4px;
            }}
            QMenu::item:selected {{
                background: rgba(196, 179, 138, 0.2);
            }}
            QMenu::separator {{
                height: 1px;
                background: rgba(196, 179, 138, 0.15);
                margin: 4px 12px;
            }}
        """)

        has_selection = self.text_area.textCursor().hasSelection()

        if has_selection:
            highlight_menu = menu.addMenu("✦  Highlight")
            highlight_menu.setStyleSheet(menu.styleSheet())
            for name, color in HIGHLIGHT_COLORS.items():
                swatch = f'<span style="color: {color};">●</span>'
                action = highlight_menu.addAction(f"{name}")
                action.triggered.connect(
                    lambda checked, c=color: self.add_highlight(c)
                )

            save_action = QAction("📖  Save to Vocabulary", self.text_area)
            save_action.triggered.connect(self.save_selected_word)
            menu.addAction(save_action)

            menu.addSeparator()

        copy_action = menu.addAction("📋  Copy")
        copy_action.setEnabled(has_selection)
        copy_action.triggered.connect(self.text_area.copy)

        menu.exec(self.text_area.mapToGlobal(pos))

    # ── Keyboard shortcuts ────────────────────────────────────────────

    def keyPressEvent(self, event):
        if event.key() == Qt.Key.Key_Right or event.key() == Qt.Key.Key_PageDown:
            self._next_page()
        elif event.key() == Qt.Key.Key_Left or event.key() == Qt.Key.Key_PageUp:
            self._prev_page()
        else:
            super().keyPressEvent(event)

    def closeEvent(self, event):
        self._cached_pixmap = None
        self._cached_doc = None
        if self._pdf_doc:
            try:
                self._pdf_doc.close()
            except Exception:
                pass
            self._pdf_doc = None
        super().closeEvent(event)
