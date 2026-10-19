"""Chapter Action Step Dialog and Actions Management Screen for Book Reader."""

from __future__ import annotations

from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtWidgets import (
    QDialog,
    QVBoxLayout,
    QHBoxLayout,
    QLabel,
    QPlainTextEdit,
    QPushButton,
    QListWidget,
    QListWidgetItem,
    QCheckBox,
    QWidget,
    QFrame,
    QMessageBox,
)

import db


class ChapterActionDialog(QDialog):
    """Dialog prompting: 'What will you do with this?' with Save and Skip buttons."""

    def __init__(
        self,
        book_id: str,
        loc: str,
        book_title: str = "",
        parent: QWidget | None = None,
    ) -> None:
        super().__init__(parent)
        self.book_id = book_id
        self.loc = loc
        self.book_title = book_title

        self.setWindowTitle("Chapter Complete")
        self.setFixedSize(480, 320)
        self.setStyleSheet("""
            QDialog {
                background-color: #1A1714;
                color: #EDE4D3;
            }
            QLabel {
                color: #EDE4D3;
            }
            QPlainTextEdit {
                background-color: #23201C;
                color: #EDE4D3;
                border: 1px solid rgba(196, 179, 138, 0.3);
                border-radius: 8px;
                padding: 10px;
                font-size: 14px;
                font-family: 'Segoe UI', sans-serif;
            }
            QPushButton {
                background-color: #24201B;
                color: #EDE4D3;
                border: 1px solid rgba(196, 179, 138, 0.25);
                border-radius: 8px;
                padding: 9px 18px;
                font-size: 13px;
                font-weight: 600;
            }
            QPushButton:hover {
                background-color: rgba(212, 175, 85, 0.15);
                border-color: #D4AF55;
                color: #D4AF55;
            }
            QPushButton#primaryBtn {
                background-color: #D4AF55;
                color: #141210;
                border: none;
                font-weight: 700;
            }
            QPushButton#primaryBtn:hover {
                background-color: #E5C370;
            }
        """)

        self._build_ui()

    def _build_ui(self) -> None:
        layout = QVBoxLayout(self)
        layout.setContentsMargins(24, 20, 24, 20)
        layout.setSpacing(14)

        title_lbl = QLabel("✨  What will you do with this?")
        title_lbl.setStyleSheet("font-size: 17px; font-weight: bold; color: #D4AF55; font-family: Georgia, serif;")
        layout.addWidget(title_lbl)

        sub_text = "Take a moment to turn what you just read into an actionable step."
        if self.book_title:
            sub_text += f"\nBook: {self.book_title}"
        sub_lbl = QLabel(sub_text)
        sub_lbl.setStyleSheet("font-size: 12px; color: #7A6F5E;")
        layout.addWidget(sub_lbl)

        self.text_input = QPlainTextEdit()
        self.text_input.setPlaceholderText("Write an action step or takeaway here...")
        layout.addWidget(self.text_input, 1)

        btn_row = QHBoxLayout()
        btn_row.setSpacing(10)

        skip_btn = QPushButton("Skip")
        skip_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        skip_btn.clicked.connect(self.reject)
        btn_row.addWidget(skip_btn)

        btn_row.addStretch()

        save_btn = QPushButton("Save Action")
        save_btn.setObjectName("primaryBtn")
        save_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        save_btn.clicked.connect(self._save_action)
        btn_row.addWidget(save_btn)

        layout.addLayout(btn_row)

    def _save_action(self) -> None:
        text = self.text_input.toPlainText().strip()
        if text:
            db.add_action(self.book_id, self.loc, text)
        self.accept()


class ActionItemWidget(QWidget):
    """Custom widget for an action item row with checkbox, text, book title, and delete."""

    action_toggled = pyqtSignal(int, int)  # (action_id, done)
    action_deleted = pyqtSignal(int)       # (action_id)

    def __init__(self, action: dict, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.action = action
        self.action_id = action["id"]
        self.is_done = bool(action.get("done", 0))

        layout = QHBoxLayout(self)
        layout.setContentsMargins(8, 6, 8, 6)
        layout.setSpacing(12)

        self.cb = QCheckBox()
        self.cb.setChecked(self.is_done)
        self.cb.setCursor(Qt.CursorShape.PointingHandCursor)
        self.cb.stateChanged.connect(self._on_check_changed)
        layout.addWidget(self.cb)

        text_box = QVBoxLayout()
        text_box.setSpacing(2)

        self.text_label = QLabel(action.get("text", ""))
        self.text_label.setWordWrap(True)
        self._update_label_style()
        text_box.addWidget(self.text_label)

        book_title = action.get("book_title") or "Book"
        date_str = action.get("created", "")[:10]
        meta_label = QLabel(f"📖 {book_title}  •  {date_str}")
        meta_label.setStyleSheet("font-size: 11px; color: #7A6F5E;")
        text_box.addWidget(meta_label)
        layout.addLayout(text_box, 1)

        del_btn = QPushButton("🗑️")
        del_btn.setFixedSize(30, 30)
        del_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        del_btn.setStyleSheet("""
            QPushButton {
                background: transparent;
                border: none;
                font-size: 13px;
                color: #7A6F5E;
            }
            QPushButton:hover {
                color: #EF5350;
            }
        """)
        del_btn.clicked.connect(lambda: self.action_deleted.emit(self.action_id))
        layout.addWidget(del_btn)

    def _update_label_style(self) -> None:
        if self.is_done:
            self.text_label.setStyleSheet("""
                font-size: 13px;
                color: #7A6F5E;
                text-decoration: line-through;
            """)
        else:
            self.text_label.setStyleSheet("""
                font-size: 13px;
                color: #EDE4D3;
                font-weight: 500;
            """)

    def _on_check_changed(self, state: int) -> None:
        self.is_done = (state == Qt.CheckState.Checked.value)
        self._update_label_style()
        self.action_toggled.emit(self.action_id, 1 if self.is_done else 0)


class ActionsListDialog(QDialog):
    """Dialog listing all chapter actions with checkboxes to mark done/undone."""

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setWindowTitle("📋 Chapter Actions")
        self.resize(640, 520)
        self.setStyleSheet("""
            QDialog {
                background-color: #1A1714;
                color: #EDE4D3;
            }
            QLabel {
                color: #EDE4D3;
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
        self.refresh_actions()

    def _build_ui(self) -> None:
        layout = QVBoxLayout(self)
        layout.setContentsMargins(24, 20, 24, 20)
        layout.setSpacing(14)

        header_row = QHBoxLayout()
        title_lbl = QLabel("📋  Chapter Actions")
        title_lbl.setStyleSheet("font-size: 18px; font-weight: bold; color: #D4AF55; font-family: Georgia, serif;")
        header_row.addWidget(title_lbl)
        header_row.addStretch()

        self.stats_lbl = QLabel("")
        self.stats_lbl.setStyleSheet("font-size: 12px; color: #7A6F5E; font-weight: 600;")
        header_row.addWidget(self.stats_lbl)
        layout.addLayout(header_row)

        self.list_widget = QListWidget()
        layout.addWidget(self.list_widget, 1)

        bottom_row = QHBoxLayout()
        bottom_row.addStretch()
        close_btn = QPushButton("Close")
        close_btn.clicked.connect(self.accept)
        bottom_row.addWidget(close_btn)
        layout.addLayout(bottom_row)

    def refresh_actions(self) -> None:
        self.list_widget.clear()
        actions = db.get_actions()
        done_count = sum(1 for a in actions if a.get("done"))
        self.stats_lbl.setText(f"{done_count}/{len(actions)} completed")

        if not actions:
            empty_item = QListWidgetItem()
            empty_lbl = QLabel("No chapter actions yet.\nFinish a chapter to create your first action step!")
            empty_lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)
            empty_lbl.setStyleSheet("color: #7A6F5E; font-size: 13px; padding: 40px;")
            self.list_widget.addItem(empty_item)
            self.list_widget.setItemWidget(empty_item, empty_lbl)
            return

        for action in actions:
            item = QListWidgetItem()
            item_widget = ActionItemWidget(action)
            item_widget.action_toggled.connect(self._on_action_toggled)
            item_widget.action_deleted.connect(self._on_action_deleted)
            item.setSizeHint(item_widget.sizeHint())
            self.list_widget.addItem(item)
            self.list_widget.setItemWidget(item, item_widget)

    def _on_action_toggled(self, action_id: int, done: int) -> None:
        db.set_action_done(action_id, done)
        actions = db.get_actions()
        done_count = sum(1 for a in actions if a.get("done"))
        self.stats_lbl.setText(f"{done_count}/{len(actions)} completed")

    def _on_action_deleted(self, action_id: int) -> None:
        db.delete_action(action_id)
        self.refresh_actions()
