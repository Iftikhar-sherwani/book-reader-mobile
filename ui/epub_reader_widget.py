"""EPUB Reader Widget — renders each chapter in QWebEngineView with text marking.

Uses QWebChannel so JavaScript can send text selections to Python.
On mouseup with selected text, shows the same MarkDialog popup as the PDF feature.
Marks are saved with loc = "chapter_index|scroll_y" and quote = exact selected text.
On chapter load, saved quotes are highlighted by wrapping them in colored spans.
"""

import json

from PyQt6.QtCore import Qt, QObject, QUrl, pyqtSignal, pyqtSlot, QTimer
from PyQt6.QtWebChannel import QWebChannel
from PyQt6.QtWebEngineWidgets import QWebEngineView
from PyQt6.QtWebEngineCore import QWebEnginePage, QWebEngineSettings
from PyQt6.QtWidgets import (
    QFrame,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QVBoxLayout,
    QWidget,
)

import db
from ui.mark_dialog import MarkDialog

# ── Color palette (matches reader_widget.py) ──────────────────────────
PAGE_BG = "#F5ECD7"
PAGE_TEXT = "#2C2416"
PAGE_BORDER = "#D4C5A0"
SPINE_SHADOW = "#C4B38A"
OUTER_BG = "#1E1B16"


class _EpubBridge(QObject):
    """QWebChannel bridge — JavaScript calls methods on this object."""

    text_selected = pyqtSignal(str, float)  # (selected_text, scroll_y)

    @pyqtSlot(str, float)
    def on_text_selected(self, text: str, scroll_y: float) -> None:
        """Called from JS when user releases mouse with a text selection."""
        if text.strip():
            self.text_selected.emit(text.strip(), scroll_y)


class EpubReaderWidget(QWidget):
    """Renders EPUB chapters one-at-a-time in a QWebEngineView.

    Signals:
        mark_added: emitted after a mark is saved (for sidebar refresh).
    """

    mark_added = pyqtSignal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self.book_id: str | None = None
        self._chapters: list[str] = []
        self._current_chapter: int = 0
        self._pending_scroll_y: float = 0.0

        self._build_ui()

    # ── UI construction ───────────────────────────────────────────────

    def _build_ui(self) -> None:
        self.setStyleSheet(f"background: {OUTER_BG};")
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        # ── WebEngineView ────────────────────────────────────────────
        self.web_view = QWebEngineView()
        page = self.web_view.page()
        settings = page.settings()
        settings.setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessRemoteUrls, False)
        settings.setAttribute(QWebEngineSettings.WebAttribute.JavascriptEnabled, True)
        page.setBackgroundColor(Qt.GlobalColor.transparent)

        # Set up the QWebChannel bridge
        self._bridge = _EpubBridge()
        self._bridge.text_selected.connect(self._on_text_selected)
        self._channel = QWebChannel()
        self._channel.registerObject("bridge", self._bridge)
        page.setWebChannel(self._channel)

        self.web_view.setStyleSheet(f"background: {PAGE_BG};")
        layout.addWidget(self.web_view, 1)

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
        self.prev_btn.clicked.connect(self._prev_chapter)
        nav_layout.addWidget(self.prev_btn)

        nav_layout.addStretch()

        self.chapter_label = QLabel("")
        self.chapter_label.setStyleSheet("""
            color: #8A7D66;
            font-size: 12px;
            font-family: 'Segoe UI', sans-serif;
            letter-spacing: 1.5px;
        """)
        self.chapter_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        nav_layout.addWidget(self.chapter_label)

        nav_layout.addStretch()

        self.next_btn = QPushButton("Next  ▸")
        self.next_btn.setStyleSheet(btn_style)
        self.next_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.next_btn.clicked.connect(self._next_chapter)
        nav_layout.addWidget(self.next_btn)

        layout.addWidget(nav_bar)

    # ── Public API ────────────────────────────────────────────────────

    def load_chapters(self, book_id: str, chapters: list[str]) -> None:
        """Load EPUB chapters and display the first one."""
        self.book_id = book_id
        self._chapters = chapters
        self._current_chapter = 0
        self._pending_scroll_y = 0.0
        self._show_chapter()

    def chapter_count(self) -> int:
        return len(self._chapters)

    def current_chapter_index(self) -> int:
        return self._current_chapter

    def go_to_chapter(self, index: int, scroll_y: float = 0.0) -> None:
        if 0 <= index < len(self._chapters):
            self._current_chapter = index
            self._pending_scroll_y = scroll_y
            self._show_chapter()

    def get_scroll_position(self, callback=None) -> None:
        """Asynchronously get current scroll Y via JS. Calls callback(chapter, scroll_y)."""
        def _handle(result):
            scroll_y = float(result) if result is not None else 0.0
            if callback:
                callback(self._current_chapter, scroll_y)

        self.web_view.page().runJavaScript("window.scrollY || 0;", _handle)

    def save_reading_position(self) -> None:
        """Save current chapter+scroll as the book's last_loc (format: 'chapter|scroll_y')."""
        if not self.book_id:
            return

        def _save(chapter: int, scroll_y: float):
            loc = f"{chapter}|{int(scroll_y)}"
            db.save_last_loc(self.book_id, loc)

        self.get_scroll_position(_save)

    def restore_reading_position(self) -> None:
        """Restore last saved chapter+scroll position."""
        if not self.book_id:
            return
        loc = db.get_last_loc(self.book_id)
        if not loc:
            return
        chapter, scroll_y = self._parse_loc(loc)
        if 0 <= chapter < len(self._chapters):
            self.go_to_chapter(chapter, scroll_y)

    def get_chapter_snippet(self) -> str:
        """Return a short text snippet from the current chapter for bookmark titles."""
        if 0 <= self._current_chapter < len(self._chapters):
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(self._chapters[self._current_chapter], "lxml")
            text = soup.get_text(strip=True)
            if text:
                return text[:50]
        return f"Chapter {self._current_chapter + 1}"

    # ── Chapter rendering ─────────────────────────────────────────────

    def _show_chapter(self) -> None:
        if not self._chapters:
            return

        chapter_html = self._chapters[self._current_chapter]
        marks = self._get_chapter_marks()
        highlight_js = self._build_highlight_js(marks)
        scroll_y = self._pending_scroll_y
        self._pending_scroll_y = 0.0

        full_html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
    * {{ margin: 0; padding: 0; box-sizing: border-box; }}
    html {{
        scroll-behavior: auto;
    }}
    body {{
        background: {PAGE_BG};
        color: {PAGE_TEXT};
        font-family: Georgia, 'Palatino Linotype', 'Book Antiqua', serif;
        font-size: 15px;
        line-height: 1.85;
        padding: 40px 55px 60px 55px;
        text-align: justify;
        -webkit-text-size-adjust: 100%;
    }}
    p {{
        text-indent: 28px;
        margin: 12px 0;
    }}
    h1, h2, h3, h4, h5, h6 {{
        text-align: center;
        color: #5C4A2A;
        margin: 30px 0 18px 0;
        letter-spacing: 1.5px;
        text-indent: 0;
    }}
    h1 {{
        font-size: 22px;
        border-bottom: 1px solid {PAGE_BORDER};
        padding-bottom: 12px;
    }}
    h2 {{ font-size: 19px; }}
    h3 {{ font-size: 17px; }}

    img {{
        max-width: 100%;
        height: auto;
        display: block;
        margin: 16px auto;
    }}
    a {{
        color: #7A5C30;
        text-decoration: none;
    }}
    hr {{
        border: none;
        border-top: 1px solid {PAGE_BORDER};
        margin: 30px 0;
    }}
    blockquote {{
        border-left: 3px solid {PAGE_BORDER};
        padding-left: 16px;
        margin: 16px 0;
        color: #5C4A2A;
        font-style: italic;
    }}
    ::selection {{
        background: rgba(212, 175, 85, 0.35);
        color: {PAGE_TEXT};
    }}
    .epub-mark {{
        border-radius: 2px;
        padding: 1px 0;
    }}
</style>
<script src="qrc:///qtwebchannel/qwebchannel.js"></script>
<script>
    var bridge = null;

    new QWebChannel(qt.webChannelTransport, function(channel) {{
        bridge = channel.objects.bridge;
    }});

    document.addEventListener('mouseup', function(e) {{
        var sel = window.getSelection();
        var text = sel ? sel.toString().trim() : '';
        if (text && bridge) {{
            var scrollY = window.scrollY || 0;
            bridge.on_text_selected(text, scrollY);
        }}
    }});

    function highlightQuotes(marks) {{
        // marks = [{{"quote": "...", "color": "#..."}}]
        if (!marks || marks.length === 0) return;

        var body = document.body;
        var walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, null, false);
        var textNodes = [];
        while (walker.nextNode()) {{
            textNodes.push(walker.currentNode);
        }}

        marks.forEach(function(mark) {{
            var quote = mark.quote;
            var color = mark.color;
            if (!quote) return;

            // Try to find the quote across text nodes
            for (var i = 0; i < textNodes.length; i++) {{
                var node = textNodes[i];
                var parent = node.parentNode;
                if (!parent || parent.classList && parent.classList.contains('epub-mark')) continue;

                var idx = node.textContent.indexOf(quote);
                if (idx !== -1) {{
                    // Found the entire quote within a single text node
                    var before = node.textContent.substring(0, idx);
                    var match = node.textContent.substring(idx, idx + quote.length);
                    var after = node.textContent.substring(idx + quote.length);

                    var span = document.createElement('span');
                    span.className = 'epub-mark';
                    span.style.backgroundColor = color;
                    span.textContent = match;

                    var frag = document.createDocumentFragment();
                    if (before) frag.appendChild(document.createTextNode(before));
                    frag.appendChild(span);
                    if (after) frag.appendChild(document.createTextNode(after));

                    parent.replaceChild(frag, node);
                    break;  // quote found, move to next mark
                }}
            }}
        }});
    }}

    // Restore scroll position after page load
    window.addEventListener('load', function() {{
        var targetScroll = {int(scroll_y)};
        if (targetScroll > 0) {{
            setTimeout(function() {{
                window.scrollTo(0, targetScroll);
            }}, 50);
        }}
        // Apply saved highlights
        var marksData = {json.dumps(highlight_js)};
        if (marksData.length > 0) {{
            setTimeout(function() {{
                highlightQuotes(marksData);
            }}, 80);
        }}
    }});
</script>
</head>
<body>
{chapter_html}
</body>
</html>"""

        self.web_view.setHtml(full_html, QUrl("about:blank"))
        self._update_nav()

    def _get_chapter_marks(self) -> list[dict]:
        """Get marks for the current chapter from the DB."""
        if not self.book_id:
            return []
        all_marks = db.get_marks(self.book_id)
        chapter_marks = []
        for m in all_marks:
            chapter, _ = self._parse_loc(m.get("loc", ""))
            if chapter == self._current_chapter:
                chapter_marks.append(m)
        return chapter_marks

    def _build_highlight_js(self, marks: list[dict]) -> list[dict]:
        """Build a list of {quote, color} dicts for JS highlightQuotes()."""
        result = []
        for m in marks:
            quote = m.get("quote", "")
            color = m.get("color", "#FFF3B0")
            if quote:
                result.append({"quote": quote, "color": color})
        return result

    @staticmethod
    def _parse_loc(loc: str) -> tuple[int, float]:
        """Parse a location string of format 'chapter_index|scroll_y'."""
        if not loc or "|" not in loc:
            # Try parsing as a plain integer (legacy format)
            try:
                return 0, float(loc)
            except (ValueError, TypeError):
                return 0, 0.0
        try:
            parts = loc.split("|", 1)
            return int(parts[0]), float(parts[1])
        except (ValueError, TypeError):
            return 0, 0.0

    # ── Text selection → Mark dialog ──────────────────────────────────

    def _on_text_selected(self, text: str, scroll_y: float) -> None:
        """Show MarkDialog when text is selected."""
        if not self.book_id or not text:
            return

        dlg = MarkDialog(quote=text, parent=self)
        if dlg.exec():
            quote, note, color = dlg.get_data()
            if not quote:
                return
            loc = f"{self._current_chapter}|{int(scroll_y)}"
            db.add_mark(
                book_id=self.book_id,
                loc=loc,
                quote=quote,
                note=note,
                color=color,
            )
            # Re-render chapter to show the new highlight
            self._pending_scroll_y = scroll_y
            self._show_chapter()
            self.mark_added.emit()

    # ── Navigation ────────────────────────────────────────────────────

    def _update_nav(self) -> None:
        total = len(self._chapters)
        self.chapter_label.setText(
            f"CHAPTER  {self._current_chapter + 1}  OF  {total}"
        )
        self.prev_btn.setEnabled(self._current_chapter > 0)
        self.next_btn.setEnabled(self._current_chapter < total - 1)

    def _next_chapter(self) -> None:
        if self._current_chapter < len(self._chapters) - 1:
            self.save_reading_position()
            self._current_chapter += 1
            self._pending_scroll_y = 0.0
            self._show_chapter()

    def _prev_chapter(self) -> None:
        if self._current_chapter > 0:
            self.save_reading_position()
            self._current_chapter -= 1
            self._pending_scroll_y = 0.0
            self._show_chapter()

    # ── Keyboard shortcuts ────────────────────────────────────────────

    def keyPressEvent(self, event):
        if event.key() in (Qt.Key.Key_Right, Qt.Key.Key_PageDown):
            self._next_chapter()
        elif event.key() in (Qt.Key.Key_Left, Qt.Key.Key_PageUp):
            self._prev_chapter()
        else:
            super().keyPressEvent(event)
