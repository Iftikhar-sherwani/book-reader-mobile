"""Mark creation and note editing dialog for Book Reader.

Provides a popup dialog with:
- Editable quote
- Note field
- 4 color buttons (Yellow, Green, Blue, Pink)
"""

from PyQt6.QtCore import Qt
from PyQt6.QtWidgets import (
    QDialog,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QPushButton,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)

MARK_COLORS = {
    "Yellow": "#FFF3B0",
    "Green": "#B8E6C8",
    "Blue": "#B3D4FC",
    "Pink": "#F8BBD0",
}

DARK_BG = "#1E1B16"
ACCENT_COLOR = "#D4AF55"
TEXT_COLOR = "#EDE3CE"
DIM_COLOR = "#7A6F5E"
BORDER_COLOR = "rgba(196, 179, 138, 0.25)"


class MarkDialog(QDialog):
    """Small popup dialog for adding or editing a mark in a PDF."""

    def __init__(self, quote: str = "", note: str = "", color: str = "#FFF3B0", parent=None, is_edit: bool = False):
        super().__init__(parent)
        self.setWindowTitle("Edit Note" if is_edit else "Add Mark")
        self.setFixedWidth(430)
        self.setWindowFlags(self.windowFlags() & ~Qt.WindowType.WindowContextHelpButtonHint)

        self.action = "mark"
        self.selected_color = color if color in MARK_COLORS.values() else MARK_COLORS["Yellow"]
        self.color_buttons: dict[str, QPushButton] = {}
        self.is_edit = is_edit

        self._build_ui(quote, note)

    def _build_ui(self, quote: str, note: str) -> None:
        self.setStyleSheet(f"""
            QDialog {{
                background: {DARK_BG};
                color: {TEXT_COLOR};
                border: 1px solid {BORDER_COLOR};
                border-radius: 8px;
            }}
            QLabel {{
                color: {DIM_COLOR};
                font-size: 11px;
                font-weight: bold;
                letter-spacing: 1px;
            }}
            QTextEdit, QLineEdit {{
                background: #141210;
                color: {TEXT_COLOR};
                border: 1px solid {BORDER_COLOR};
                border-radius: 6px;
                padding: 8px;
                font-size: 13px;
                font-family: Georgia, 'Palatino Linotype', serif;
            }}
            QTextEdit:focus, QLineEdit:focus {{
                border-color: {ACCENT_COLOR};
            }}
        """)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(20, 20, 20, 20)
        layout.setSpacing(14)

        # ── 1. Quote Field (editable) ────────────────────────────────
        quote_label = QLabel("QUOTE")
        layout.addWidget(quote_label)

        self.quote_edit = QTextEdit()
        self.quote_edit.setPlainText(quote)
        self.quote_edit.setFixedHeight(75)
        self.quote_edit.setPlaceholderText("Selected text quote...")
        layout.addWidget(self.quote_edit)

        # ── 2. Note Field ────────────────────────────────────────────
        note_label = QLabel("NOTE")
        layout.addWidget(note_label)

        self.note_edit = QLineEdit()
        self.note_edit.setText(note)
        self.note_edit.setPlaceholderText("Add a personal note or comment (optional)...")
        layout.addWidget(self.note_edit)

        # ── 3. 4 Color Buttons (Yellow, Green, Blue, Pink) ───────────
        color_label = QLabel("COLOR")
        layout.addWidget(color_label)

        color_row = QHBoxLayout()
        color_row.setSpacing(10)

        for name, hex_code in MARK_COLORS.items():
            btn = QPushButton(name)
            btn.setCursor(Qt.CursorShape.PointingHandCursor)
            btn.setFixedHeight(30)
            self._update_color_btn_style(btn, hex_code, is_selected=(hex_code == self.selected_color))
            btn.clicked.connect(lambda checked, c=hex_code: self._select_color(c))
            self.color_buttons[hex_code] = btn
            color_row.addWidget(btn)

        layout.addLayout(color_row)

        # ── 4. Action Buttons ────────────────────────────────────────
        btn_row = QHBoxLayout()
        btn_row.setSpacing(10)
        btn_row.addStretch()

        cancel_btn = QPushButton("Cancel")
        cancel_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        cancel_btn.setStyleSheet(f"""
            QPushButton {{
                background: transparent;
                color: {DIM_COLOR};
                border: 1px solid {BORDER_COLOR};
                border-radius: 6px;
                padding: 7px 18px;
                font-size: 12px;
            }}
            QPushButton:hover {{
                color: {TEXT_COLOR};
                border-color: rgba(196, 179, 138, 0.45);
            }}
        """)
        cancel_btn.clicked.connect(self.reject)
        btn_row.addWidget(cancel_btn)

        vocab_btn = QPushButton("📖  Vocab Lookup")
        vocab_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        vocab_btn.setToolTip("Look up definition and save to Vocabulary tab")
        vocab_btn.setStyleSheet(f"""
            QPushButton {{
                background: rgba(196, 179, 138, 0.12);
                color: {TEXT_COLOR};
                border: 1px solid {BORDER_COLOR};
                border-radius: 6px;
                padding: 7px 14px;
                font-size: 12px;
                font-weight: 600;
            }}
            QPushButton:hover {{
                background: rgba(212, 175, 85, 0.22);
                color: {ACCENT_COLOR};
                border-color: {ACCENT_COLOR};
            }}
        """)
        vocab_btn.clicked.connect(self._on_vocab_clicked)
        btn_row.addWidget(vocab_btn)

        save_btn = QPushButton("Save Mark" if not self.is_edit else "Update Note")
        save_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        save_btn.setStyleSheet(f"""
            QPushButton {{
                background: rgba(212, 175, 85, 0.2);
                color: {ACCENT_COLOR};
                border: 1px solid rgba(212, 175, 85, 0.45);
                border-radius: 6px;
                padding: 7px 22px;
                font-size: 12px;
                font-weight: bold;
            }}
            QPushButton:hover {{
                background: rgba(212, 175, 85, 0.32);
                border-color: {ACCENT_COLOR};
            }}
        """)
        save_btn.clicked.connect(self._on_save_clicked)
        btn_row.addWidget(save_btn)

        layout.addLayout(btn_row)

    def _on_vocab_clicked(self) -> None:
        self.action = "vocab"
        self.accept()

    def _on_save_clicked(self) -> None:
        self.action = "mark"
        self.accept()

    def _select_color(self, hex_code: str) -> None:
        self.selected_color = hex_code
        for code, btn in self.color_buttons.items():
            self._update_color_btn_style(btn, code, is_selected=(code == hex_code))

    def _update_color_btn_style(self, btn: QPushButton, hex_code: str, is_selected: bool) -> None:
        border = f"2px solid {ACCENT_COLOR}" if is_selected else f"1px solid rgba(0,0,0,0.4)"
        weight = "bold" if is_selected else "normal"
        btn.setStyleSheet(f"""
            QPushButton {{
                background-color: {hex_code};
                color: #211E1A;
                border: {border};
                border-radius: 6px;
                font-weight: {weight};
                font-size: 11px;
                padding: 4px 8px;
            }}
            QPushButton:hover {{
                border: 2px solid {ACCENT_COLOR};
            }}
        """)

    def get_data(self) -> tuple[str, str, str]:
        """Return (quote, note, color)."""
        return (
            self.quote_edit.toPlainText().strip(),
            self.note_edit.text().strip(),
            self.selected_color,
        )
