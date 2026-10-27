"""EPUB Reader Widget — renders each chapter in QWebEngineView with text marking, themes, font sizing, and dictionary lookup.

Uses QWebChannel so JavaScript can send text selections and double-clicks to Python.
On mouseup with selected text, shows MarkDialog.
On double-click, shows DictionaryPopupDialog.
When advancing chapters, prompts with ChapterActionDialog.
"""

from __future__ import annotations

import json
from PyQt6.QtCore import Qt, QObject, QUrl, pyqtSignal, pyqtSlot
from PyQt6.QtWebChannel import QWebChannel
from PyQt6.QtWebEngineWidgets import QWebEngineView
from PyQt6.QtWebEngineCore import QWebEngineSettings
from PyQt6.QtWidgets import (
    QHBoxLayout,
    QLabel,
    QPushButton,
    QVBoxLayout,
    QWidget,
)

import db
from core import settings_manager
from ui.mark_dialog import MarkDialog
from ui.dictionary_dialog import DictionaryPopupDialog
from ui.action_dialog import ChapterActionDialog

# Theme definitions
THEMES = {
    "Light": {
        "bg": "#FFFFFF",
        "text": "#222222",
        "heading": "#111111",
        "border": "#E5E5E5",
        "outer_bg": "#F5F5F5",
        "mark_text": "#111111",
    },
    "Sepia": {
        "bg": "#F5ECD7",
        "text": "#2C2416",
        "heading": "#5C4A2A",
        "border": "#D4C5A0",
        "outer_bg": "#1E1B16",
        "mark_text": "#1A1714",
    },
    "Dark": {
        "bg": "#181818",
        "text": "#E2DED7",
        "heading": "#D4AF55",
        "border": "#333333",
        "outer_bg": "#121212",
        "mark_text": "#111111",
    },
}


class _EpubBridge(QObject):
    """QWebChannel bridge — JavaScript calls methods on this object."""

    text_selected = pyqtSignal(str, float)   # (selected_text, scroll_y)
    word_double_clicked = pyqtSignal(str)     # (word)

    @pyqtSlot(str, float)
    def on_text_selected(self, text: str, scroll_y: float) -> None:
        """Called from JS when user releases mouse with a text selection."""
        if text.strip():
            self.text_selected.emit(text.strip(), scroll_y)

    @pyqtSlot(str)
    def on_word_double_clicked(self, word: str) -> None:
        """Called from JS when user double-clicks a word."""
        if word.strip():
            self.word_double_clicked.emit(word.strip())


class EpubReaderWidget(QWidget):
    """Renders EPUB chapters one-at-a-time in a QWebEngineView.

    Signals:
        mark_added: emitted after a mark is saved (for sidebar refresh).
        chapter_changed: emitted after navigating to another chapter.
    """

    mark_added = pyqtSignal()
    word_saved = pyqtSignal()
    chapter_changed = pyqtSignal(int, int)  # (current_chapter, total_chapters)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.book_id: str | None = None
        self.book_title: str = ""
        self._chapters: list[str] = []
        self._current_chapter: int = 0
        self._pending_scroll_y: float = 0.0

        # Load persisted settings
        self.theme = settings_manager.get_setting("theme", "Sepia")
        self.font_size = settings_manager.get_setting("font_size", 17)
        self.line_width = settings_manager.get_setting("line_width", 720)

        self._build_ui()

    # ── UI construction ───────────────────────────────────────────────

    def _build_ui(self) -> None:
        outer_bg = THEMES.get(self.theme, THEMES["Sepia"])["outer_bg"]
        self.setStyleSheet(f"background: {outer_bg};")
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
        self._bridge.word_double_clicked.connect(self._on_word_double_clicked)
        self._channel = QWebChannel()
        self._channel.registerObject("bridge", self._bridge)
        page.setWebChannel(self._channel)

        t_cfg = THEMES.get(self.theme, THEMES["Sepia"])
        self.web_view.setStyleSheet(f"background: {t_cfg['bg']};")
        layout.addWidget(self.web_view, 1)

        # ── Bottom navigation bar ────────────────────────────────────
        self.nav_bar = QWidget()
        self.nav_bar.setStyleSheet("background: transparent;")
        nav_layout = QHBoxLayout(self.nav_bar)
        nav_layout.setContentsMargins(10, 8, 10, 4)

        btn_style = """
            QPushButton {
                background: rgba(212, 175, 85, 0.12);
                color: #C4B38A;
                border: 1px solid rgba(196, 179, 138, 0.25);
                border-radius: 6px;
                padding: 8px 22px;
                font-size: 13px;
                font-weight: 500;
                letter-spacing: 0.5px;
            }
            QPushButton:hover {
                background: rgba(212, 175, 85, 0.22);
                color: #E8DCC6;
                border-color: rgba(196, 179, 138, 0.5);
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

        layout.addWidget(self.nav_bar)

    # ── Public API ────────────────────────────────────────────────────

    def load_chapters(self, book_id: str, chapters: list[str], book_title: str = "") -> None:
        """Load EPUB chapters and display the first one."""
        self.book_id = book_id
        self.book_title = book_title
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

    def set_theme(self, theme: str) -> None:
        """Switch reading theme (Light, Sepia, Dark)."""
        if theme in THEMES:
            self.theme = theme
            settings_manager.set_setting("theme", theme)
            outer_bg = THEMES[theme]["outer_bg"]
            self.setStyleSheet(f"background: {outer_bg};")
            self._show_chapter()

    def set_font_size(self, size: int) -> None:
        """Adjust EPUB font size in px."""
        self.font_size = max(12, min(36, size))
        settings_manager.set_setting("font_size", self.font_size)
        self._show_chapter()

    def set_line_width(self, width: int) -> None:
        """Adjust EPUB reading column max width in px."""
        self.line_width = max(400, min(1400, width))
        settings_manager.set_setting("line_width", self.line_width)
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

        t = THEMES.get(self.theme, THEMES["Sepia"])

        full_html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
    * {{ margin: 0; padding: 0; box-sizing: border-box; }}
    html {{
        scroll-behavior: auto;
        background: {t['bg']};
    }}
    body {{
        background: {t['bg']};
        color: {t['text']};
        font-family: Georgia, 'Palatino Linotype', 'Book Antiqua', serif;
        font-size: {self.font_size}px;
        line-height: 1.85;
        padding: 40px 30px 60px 30px;
        max-width: {self.line_width}px;
        margin: 0 auto;
        text-align: justify;
        -webkit-text-size-adjust: 100%;
    }}
    p {{
        text-indent: 28px;
        margin: 14px 0;
    }}
    h1, h2, h3, h4, h5, h6 {{
        text-align: center;
        color: {t['heading']};
        margin: 32px 0 20px 0;
        letter-spacing: 1.5px;
        text-indent: 0;
    }}
    h1 {{
        font-size: {self.font_size + 8}px;
        border-bottom: 1px solid {t['border']};
        padding-bottom: 12px;
    }}
    h2 {{ font-size: {self.font_size + 5}px; }}
    h3 {{ font-size: {self.font_size + 3}px; }}
    img {{
        max-width: 100%;
        height: auto;
        display: block;
        margin: 20px auto;
        border-radius: 4px;
    }}
    blockquote {{
        border-left: 3px solid #D4AF55;
        padding-left: 20px;
        margin: 16px 20px;
        font-style: italic;
        color: {t['heading']};
    }}
    ::selection {{
        background: rgba(212, 175, 85, 0.45);
        color: inherit;
    }}
    .epub-mark {{
        border-radius: 2px;
        padding: 1px 2px;
        color: {t['mark_text']};
    }}
</style>
<script src="qrc:///qtwebchannel/qwebchannel.js"></script>
<script>
    var bridge = null;
    new QWebChannel(qt.webChannelTransport, function(channel) {{
        bridge = channel.objects.bridge;
    }});

    // Text selection for marking
    document.addEventListener('mouseup', function(e) {{
        var sel = window.getSelection();
        var text = sel ? sel.toString().trim() : '';
        if (text && text.length > 1 && bridge) {{
            var scrollY = window.scrollY || 0;
            bridge.on_text_selected(text, scrollY);
        }}
    }});

    // Double-click word dictionary lookup
    document.addEventListener('dblclick', function(e) {{
        var sel = window.getSelection();
        if (sel) {{
            var word = sel.toString().trim();
            if (word && word.length < 50 && bridge && bridge.on_word_double_clicked) {{
                bridge.on_word_double_clicked(word);
            }}
        }}
    }});

    function highlightQuotes(marks) {{
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

            for (var i = 0; i < textNodes.length; i++) {{
                var node = textNodes[i];
                var parent = node.parentNode;
                if (!parent || parent.classList && parent.classList.contains('epub-mark')) continue;

                var idx = node.textContent.indexOf(quote);
                if (idx !== -1) {{
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
                    break;
                }}
            }}
        }});
    }}

    window.addEventListener('load', function() {{
        var targetScroll = {int(scroll_y)};
        if (targetScroll > 0) {{
            setTimeout(function() {{
                window.scrollTo(0, targetScroll);
            }}, 50);
        }}
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
        self.chapter_changed.emit(self._current_chapter, len(self._chapters))

    def _get_chapter_marks(self) -> list[dict]:
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
        result = []
        for m in marks:
            quote = m.get("quote", "")
            color = m.get("color", "#FFF3B0")
            if quote:
                result.append({"quote": quote, "color": color})
        return result

    @staticmethod
    def _parse_loc(loc: str) -> tuple[int, float]:
        if not loc or "|" not in loc:
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
        if not self.book_id or not text:
            return

        dlg = MarkDialog(quote=text, parent=self)
        if dlg.exec():
            if getattr(dlg, "action", "mark") == "vocab":
                import string
                quote, _, _ = dlg.get_data()
                target_text = quote.strip() if quote.strip() else text.strip()
                clean_word = target_text.strip(string.punctuation + "“”‘’—–…\u200b \t\r\n")
                if clean_word:
                    dlg_dict = DictionaryPopupDialog(word=clean_word, book_title=self.book_title, parent=self)
                    dlg_dict.word_saved.connect(self.word_saved.emit)
                    dlg_dict.exec()
                return

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
            self._pending_scroll_y = scroll_y
            self._show_chapter()
            self.mark_added.emit()

    def _on_word_double_clicked(self, word: str) -> None:
        dlg = DictionaryPopupDialog(word=word, book_title=self.book_title, parent=self)
        dlg.word_saved.connect(self.word_saved.emit)
        dlg.exec()

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
            # Feature 8: Chapter Action Step
            if self.book_id:
                action_dlg = ChapterActionDialog(
                    book_id=self.book_id,
                    loc=str(self._current_chapter),
                    book_title=self.book_title,
                    parent=self,
                )
                action_dlg.exec()

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
