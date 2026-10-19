"""Dictionary popup dialog and Vocabulary manager dialog for Book Reader."""

from __future__ import annotations

import json
import urllib.request
import urllib.error
from PyQt6.QtCore import Qt, QThread, pyqtSignal
from PyQt6.QtWidgets import (
    QDialog,
    QVBoxLayout,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QScrollArea,
    QWidget,
    QFrame,
    QListWidget,
    QListWidgetItem,
    QLineEdit,
)

import db


class DictionaryLookupThread(QThread):
    """Background thread fetching definition from api.dictionaryapi.dev."""

    result_ready = pyqtSignal(bool, str, list)  # (success, phonetic, definitions)

    def __init__(self, word: str, parent=None) -> None:
        super().__init__(parent)
        self.word = word.strip()

    def run(self) -> None:
        clean = "".join(c for c in self.word if c.isalnum() or c in "-'").lower()
        if not clean:
            self.result_ready.emit(False, "", ["No definition found."])
            return

        url = f"https://api.dictionaryapi.dev/api/v2/entries/en/{urllib.parse.quote(clean)}"
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "Mozilla/5.0 BookReaderDesktop/1.0"},
        )
        try:
            with urllib.request.urlopen(req, timeout=4) as response:
                data = json.loads(response.read().decode("utf-8"))
                if not data or not isinstance(data, list):
                    self.result_ready.emit(False, "", ["No definition found."])
                    return

                entry = data[0]
                phonetic = entry.get("phonetic", "")
                if not phonetic:
                    for ph in entry.get("phonetics", []):
                        if ph.get("text"):
                            phonetic = ph["text"]
                            break

                defs: list[dict] = []
                for meaning in entry.get("meanings", []):
                    pos = meaning.get("partOfSpeech", "")
                    for d in meaning.get("definitions", [])[:2]:
                        defs.append({
                            "pos": pos,
                            "definition": d.get("definition", ""),
                            "example": d.get("example", ""),
                        })

                if not defs:
                    self.result_ready.emit(False, phonetic, ["No definition found."])
                else:
                    self.result_ready.emit(True, phonetic, defs)
        except Exception:
            self.result_ready.emit(False, "", ["No definition found."])


class DictionaryPopupDialog(QDialog):
    """Small popup dialog shown on word double-click with definition & Save word button."""

    word_saved = pyqtSignal()

    def __init__(
        self,
        word: str,
        book_title: str = "",
        parent: QWidget | None = None,
    ) -> None:
        super().__init__(parent)
        self.word = word.strip()
        self.book_title = book_title
        self.best_definition = ""

        self.setWindowTitle(f"Definition: {self.word}")
        self.setFixedSize(440, 360)
        self.setStyleSheet("""
            QDialog {
                background-color: #1A1714;
                color: #EDE4D3;
            }
            QLabel {
                color: #EDE4D3;
            }
            QPushButton {
                background-color: #24201B;
                color: #EDE4D3;
                border: 1px solid rgba(196, 179, 138, 0.25);
                border-radius: 8px;
                padding: 8px 16px;
                font-size: 13px;
                font-weight: 600;
            }
            QPushButton:hover {
                background-color: rgba(212, 175, 85, 0.15);
                border-color: #D4AF55;
                color: #D4AF55;
            }
            QPushButton#saveBtn {
                background-color: #D4AF55;
                color: #141210;
                border: none;
                font-weight: 700;
            }
            QPushButton#saveBtn:hover {
                background-color: #E5C370;
            }
        """)

        self._build_ui()
        self._start_lookup()

    def _build_ui(self) -> None:
        layout = QVBoxLayout(self)
        layout.setContentsMargins(20, 18, 20, 18)
        layout.setSpacing(12)

        # Title & phonetic row
        title_row = QHBoxLayout()
        self.word_label = QLabel(self.word)
        self.word_label.setStyleSheet("font-size: 19px; font-weight: bold; color: #D4AF55; font-family: Georgia, serif;")
        title_row.addWidget(self.word_label)

        self.phonetic_label = QLabel("")
        self.phonetic_label.setStyleSheet("font-size: 13px; color: #7A6F5E; font-style: italic;")
        title_row.addWidget(self.phonetic_label)
        title_row.addStretch()
        layout.addLayout(title_row)

        # Scroll Area for Definitions
        self.scroll = QScrollArea()
        self.scroll.setWidgetResizable(True)
        self.scroll.setFrameShape(QFrame.Shape.NoFrame)
        self.scroll.setStyleSheet("background: #23201C; border: 1px solid rgba(196, 179, 138, 0.15); border-radius: 8px;")

        self.content_widget = QWidget()
        self.content_widget.setStyleSheet("background: transparent;")
        self.content_layout = QVBoxLayout(self.content_widget)
        self.content_layout.setContentsMargins(14, 14, 14, 14)
        self.content_layout.setSpacing(10)

        self.loading_label = QLabel("Looking up definition...")
        self.loading_label.setStyleSheet("color: #7A6F5E; font-size: 13px; font-style: italic;")
        self.content_layout.addWidget(self.loading_label)

        self.scroll.setWidget(self.content_widget)
        layout.addWidget(self.scroll, 1)

        # Buttons row
        btn_row = QHBoxLayout()
        self.save_btn = QPushButton("📖  Save word")
        self.save_btn.setObjectName("saveBtn")
        self.save_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.save_btn.setEnabled(False)
        self.save_btn.clicked.connect(self._save_word)
        btn_row.addWidget(self.save_btn)

        btn_row.addStretch()

        close_btn = QPushButton("Close")
        close_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        close_btn.clicked.connect(self.accept)
        btn_row.addWidget(close_btn)

        layout.addLayout(btn_row)

    def _start_lookup(self) -> None:
        self.worker = DictionaryLookupThread(self.word, self)
        self.worker.result_ready.connect(self._on_result)
        self.worker.start()

    def _on_result(self, success: bool, phonetic: str, definitions: list) -> None:
        self.loading_label.setVisible(False)
        if phonetic:
            self.phonetic_label.setText(phonetic)

        if not success:
            not_found = QLabel("No definition found.")
            not_found.setStyleSheet("color: #7A6F5E; font-size: 14px; font-style: italic; padding: 20px;")
            self.content_layout.addWidget(not_found)
            self.best_definition = "No definition found."
            self.save_btn.setEnabled(True)
            return

        first_def = ""
        for item in definitions:
            if isinstance(item, dict):
                pos = item.get("pos", "")
                text = item.get("definition", "")
                example = item.get("example", "")
                if not first_def:
                    first_def = f"({pos}) {text}" if pos else text

                box = QWidget()
                box_layout = QVBoxLayout(box)
                box_layout.setContentsMargins(0, 0, 0, 6)
                box_layout.setSpacing(3)

                if pos:
                    pos_lbl = QLabel(pos)
                    pos_lbl.setStyleSheet("color: #D4AF55; font-size: 11px; font-weight: bold; text-transform: uppercase;")
                    box_layout.addWidget(pos_lbl)

                def_lbl = QLabel(f"• {text}")
                def_lbl.setWordWrap(True)
                def_lbl.setStyleSheet("color: #EDE4D3; font-size: 13px; line-height: 1.4;")
                box_layout.addWidget(def_lbl)

                if example:
                    ex_lbl = QLabel(f'  "{example}"')
                    ex_lbl.setWordWrap(True)
                    ex_lbl.setStyleSheet("color: #7A6F5E; font-size: 12px; font-style: italic;")
                    box_layout.addWidget(ex_lbl)

                self.content_layout.addWidget(box)

        self.best_definition = first_def or "No definition found."
        self.save_btn.setEnabled(True)

    def _save_word(self) -> None:
        db.add_vocab(
            word=self.word,
            definition=self.best_definition,
            book=self.book_title or "General",
        )
        self.save_btn.setText("✓  Saved!")
        self.save_btn.setEnabled(False)
        self.word_saved.emit()


class VocabularyListDialog(QDialog):
    """Dialog showing all saved vocabulary words with search and delete options."""

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setWindowTitle("📖 Vocabulary")
        self.resize(640, 520)
        self.setStyleSheet("""
            QDialog {
                background-color: #1A1714;
                color: #EDE4D3;
            }
            QLabel {
                color: #EDE4D3;
            }
            QLineEdit {
                background-color: #23201C;
                color: #EDE4D3;
                border: 1px solid rgba(196, 179, 138, 0.25);
                border-radius: 8px;
                padding: 8px 12px;
                font-size: 13px;
            }
            QListWidget {
                background-color: #141210;
                border: 1px solid rgba(196, 179, 138, 0.2);
                border-radius: 8px;
                padding: 6px;
                outline: none;
            }
            QPushButton {
                background-color: #24201B;
                color: #EDE4D3;
                border: 1px solid rgba(196, 179, 138, 0.25);
                border-radius: 8px;
                padding: 8px 16px;
                font-size: 13px;
                font-weight: 600;
            }
            QPushButton:hover {
                background-color: rgba(212, 175, 85, 0.15);
                border-color: #D4AF55;
                color: #D4AF55;
            }
        """)

        self._build_ui()
        self.refresh_vocab()

    def _build_ui(self) -> None:
        layout = QVBoxLayout(self)
        layout.setContentsMargins(24, 20, 24, 20)
        layout.setSpacing(14)

        header_row = QHBoxLayout()
        title_lbl = QLabel("📖  Vocabulary")
        title_lbl.setStyleSheet("font-size: 18px; font-weight: bold; color: #D4AF55; font-family: Georgia, serif;")
        header_row.addWidget(title_lbl)
        header_row.addStretch()

        self.count_lbl = QLabel("")
        self.count_lbl.setStyleSheet("font-size: 12px; color: #7A6F5E; font-weight: 600;")
        header_row.addWidget(self.count_lbl)
        layout.addLayout(header_row)

        self.search_input = QLineEdit()
        self.search_input.setPlaceholderText("Search saved words...")
        self.search_input.textChanged.connect(self.refresh_vocab)
        layout.addWidget(self.search_input)

        self.list_widget = QListWidget()
        layout.addWidget(self.list_widget, 1)

        bottom_row = QHBoxLayout()
        bottom_row.addStretch()
        close_btn = QPushButton("Close")
        close_btn.clicked.connect(self.accept)
        bottom_row.addWidget(close_btn)
        layout.addLayout(bottom_row)

    def refresh_vocab(self) -> None:
        self.list_widget.clear()
        words = db.get_vocab()
        query = self.search_input.text().strip().lower()
        if query:
            words = [w for w in words if query in w["word"].lower() or query in w["definition"].lower()]

        self.count_lbl.setText(f"{len(words)} {'word' if len(words) == 1 else 'words'}")

        if not words:
            item = QListWidgetItem()
            lbl = QLabel("No vocabulary words found.\nDouble-click any word while reading to look up and save it!")
            lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)
            lbl.setStyleSheet("color: #7A6F5E; font-size: 13px; padding: 40px;")
            self.list_widget.addItem(item)
            self.list_widget.setItemWidget(item, lbl)
            return

        for w in words:
            item = QListWidgetItem()
            widget = QWidget()
            w_layout = QHBoxLayout(widget)
            w_layout.setContentsMargins(10, 8, 10, 8)
            w_layout.setSpacing(12)

            info = QVBoxLayout()
            info.setSpacing(2)

            w_title = QLabel(w["word"])
            w_title.setStyleSheet("font-size: 14px; font-weight: bold; color: #D4AF55;")
            info.addWidget(w_title)

            w_def = QLabel(w.get("definition", ""))
            w_def.setWordWrap(True)
            w_def.setStyleSheet("font-size: 12px; color: #EDE4D3;")
            info.addWidget(w_def)

            book = w.get("book") or "Book"
            date = w.get("date", "")[:10]
            meta = QLabel(f"📖 {book}  •  {date}")
            meta.setStyleSheet("font-size: 10px; color: #7A6F5E;")
            info.addWidget(meta)

            w_layout.addLayout(info, 1)

            del_btn = QPushButton("🗑️")
            del_btn.setFixedSize(32, 32)
            del_btn.setCursor(Qt.CursorShape.PointingHandCursor)
            del_btn.setStyleSheet("background: transparent; border: none; font-size: 13px; color: #7A6F5E;")
            vocab_id = w["id"]
            del_btn.clicked.connect(lambda checked, vid=vocab_id: self._delete_word(vid))
            w_layout.addWidget(del_btn)

            item.setSizeHint(widget.sizeHint())
            self.list_widget.addItem(item)
            self.list_widget.setItemWidget(item, widget)

    def _delete_word(self, vocab_id: int) -> None:
        db.delete_vocab(vocab_id)
        self.refresh_vocab()
