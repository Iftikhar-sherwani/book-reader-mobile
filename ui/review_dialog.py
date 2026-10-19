"""Daily Review Dialog for spaced repetition cards."""

from __future__ import annotations

from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtWidgets import (
    QDialog,
    QVBoxLayout,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QFrame,
    QWidget,
)

import db


class ReviewDialog(QDialog):
    """Interactive spaced repetition review session for marks due today.

    Shows up to 10 cards per session with ratings: Forgot, Hard, Good, Easy.
    """

    review_completed = pyqtSignal()

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setWindowTitle("🎯 Daily Review")
        self.setFixedSize(620, 520)
        self.cards = db.get_due_reviews(limit=10)
        self.current_idx = 0
        self.note_visible = False

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
                padding: 10px 18px;
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
        self._load_card()

    def _build_ui(self) -> None:
        self.main_layout = QVBoxLayout(self)
        self.main_layout.setContentsMargins(28, 24, 28, 24)
        self.main_layout.setSpacing(16)

        # Header with session progress
        header_row = QHBoxLayout()
        self.title_label = QLabel("🎯  Daily Review")
        self.title_label.setStyleSheet("font-size: 18px; font-weight: bold; color: #D4AF55; font-family: Georgia, serif;")
        header_row.addWidget(self.title_label)
        header_row.addStretch()

        self.progress_counter = QLabel("")
        self.progress_counter.setStyleSheet("font-size: 12px; color: #7A6F5E; font-weight: 600;")
        header_row.addWidget(self.progress_counter)
        self.main_layout.addLayout(header_row)

        # Main Card Frame
        self.card_frame = QFrame()
        self.card_frame.setStyleSheet("""
            QFrame {
                background-color: #23201C;
                border: 1px solid rgba(196, 179, 138, 0.2);
                border-radius: 12px;
                padding: 18px;
            }
        """)
        card_layout = QVBoxLayout(self.card_frame)
        card_layout.setSpacing(14)

        # Book Title
        self.book_title_label = QLabel("")
        self.book_title_label.setStyleSheet("font-size: 13px; color: #C4B38A; font-weight: bold; letter-spacing: 0.5px;")
        card_layout.addWidget(self.book_title_label)

        # Quote Text
        self.quote_label = QLabel("")
        self.quote_label.setWordWrap(True)
        self.quote_label.setStyleSheet("""
            font-size: 16px;
            line-height: 1.5;
            color: #F5ECD7;
            font-family: Georgia, serif;
            padding: 8px 0;
        """)
        card_layout.addWidget(self.quote_label, 1)

        # Show Note Button & Note Box
        self.show_note_btn = QPushButton("📝  Show note")
        self.show_note_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.show_note_btn.clicked.connect(self._toggle_note)
        card_layout.addWidget(self.show_note_btn, alignment=Qt.AlignmentFlag.AlignLeft)

        self.note_box = QLabel("")
        self.note_box.setWordWrap(True)
        self.note_box.setStyleSheet("""
            background-color: rgba(212, 175, 85, 0.08);
            border-left: 3px solid #D4AF55;
            border-radius: 4px;
            padding: 10px 14px;
            font-size: 13px;
            color: #E2D7BE;
        """)
        self.note_box.setVisible(False)
        card_layout.addWidget(self.note_box)

        self.main_layout.addWidget(self.card_frame, 1)

        # Rating Buttons Row
        self.rating_layout = QHBoxLayout()
        self.rating_layout.setSpacing(10)

        # Rating buttons: Forgot, Hard, Good, Easy
        self.forgot_btn = QPushButton("Forgot (1d)")
        self.forgot_btn.setStyleSheet("""
            QPushButton {
                background-color: rgba(239, 83, 80, 0.15);
                border: 1px solid rgba(239, 83, 80, 0.4);
                color: #EF5350;
            }
            QPushButton:hover {
                background-color: rgba(239, 83, 80, 0.28);
                border-color: #EF5350;
            }
        """)
        self.forgot_btn.clicked.connect(lambda: self._rate("forgot"))
        self.rating_layout.addWidget(self.forgot_btn)

        self.hard_btn = QPushButton("Hard (x1.2)")
        self.hard_btn.setStyleSheet("""
            QPushButton {
                background-color: rgba(255, 167, 38, 0.15);
                border: 1px solid rgba(255, 167, 38, 0.4);
                color: #FFA726;
            }
            QPushButton:hover {
                background-color: rgba(255, 167, 38, 0.28);
                border-color: #FFA726;
            }
        """)
        self.hard_btn.clicked.connect(lambda: self._rate("hard"))
        self.rating_layout.addWidget(self.hard_btn)

        self.good_btn = QPushButton("Good (x2)")
        self.good_btn.setStyleSheet("""
            QPushButton {
                background-color: rgba(102, 187, 106, 0.15);
                border: 1px solid rgba(102, 187, 106, 0.4);
                color: #66BB6A;
            }
            QPushButton:hover {
                background-color: rgba(102, 187, 106, 0.28);
                border-color: #66BB6A;
            }
        """)
        self.good_btn.clicked.connect(lambda: self._rate("good"))
        self.rating_layout.addWidget(self.good_btn)

        self.easy_btn = QPushButton("Easy (x3)")
        self.easy_btn.setStyleSheet("""
            QPushButton {
                background-color: rgba(38, 198, 218, 0.15);
                border: 1px solid rgba(38, 198, 218, 0.4);
                color: #26C6DA;
            }
            QPushButton:hover {
                background-color: rgba(38, 198, 218, 0.28);
                border-color: #26C6DA;
            }
        """)
        self.easy_btn.clicked.connect(lambda: self._rate("easy"))
        self.rating_layout.addWidget(self.easy_btn)

        self.main_layout.addLayout(self.rating_layout)

        # Empty / Done state container
        self.done_container = QWidget()
        done_layout = QVBoxLayout(self.done_container)
        done_layout.setAlignment(Qt.AlignmentFlag.AlignCenter)
        done_layout.setSpacing(14)

        done_icon = QLabel("🎉")
        done_icon.setStyleSheet("font-size: 54px;")
        done_icon.setAlignment(Qt.AlignmentFlag.AlignCenter)
        done_layout.addWidget(done_icon)

        done_msg = QLabel("Done for today.")
        done_msg.setStyleSheet("font-size: 20px; font-weight: bold; color: #D4AF55; font-family: Georgia, serif;")
        done_msg.setAlignment(Qt.AlignmentFlag.AlignCenter)
        done_layout.addWidget(done_msg)

        done_sub = QLabel("You have completed all review cards scheduled for today!")
        done_sub.setStyleSheet("font-size: 13px; color: #A49372;")
        done_sub.setAlignment(Qt.AlignmentFlag.AlignCenter)
        done_layout.addWidget(done_sub)

        close_btn = QPushButton("Close")
        close_btn.setStyleSheet("""
            QPushButton {
                background-color: #D4AF55;
                color: #141210;
                font-weight: bold;
                padding: 10px 28px;
            }
            QPushButton:hover {
                background-color: #E5C370;
            }
        """)
        close_btn.clicked.connect(self.accept)
        done_layout.addWidget(close_btn, alignment=Qt.AlignmentFlag.AlignCenter)

        self.main_layout.addWidget(self.done_container)
        self.done_container.setVisible(False)

    def _load_card(self) -> None:
        if not self.cards or self.current_idx >= len(self.cards):
            self._show_done()
            return

        card = self.cards[self.current_idx]
        self.progress_counter.setText(f"Card {self.current_idx + 1} of {len(self.cards)}")
        self.book_title_label.setText(f"📖  {card.get('book_title') or 'Book'}")
        
        quote = card.get("quote", "").strip() or "No quote text available"
        self.quote_label.setText(f'"{quote}"')

        note = card.get("note", "").strip()
        if note:
            self.note_box.setText(f"Note: {note}")
        else:
            self.note_box.setText("No note was added for this mark.")

        self.note_visible = False
        self.note_box.setVisible(False)
        self.show_note_btn.setText("📝  Show note")
        self.show_note_btn.setVisible(True)

        self.card_frame.setVisible(True)
        for i in range(self.rating_layout.count()):
            self.rating_layout.itemAt(i).widget().setVisible(True)
        self.done_container.setVisible(False)

    def _toggle_note(self) -> None:
        self.note_visible = not self.note_visible
        self.note_box.setVisible(self.note_visible)
        self.show_note_btn.setText("📝  Hide note" if self.note_visible else "📝  Show note")

    def _rate(self, rating: str) -> None:
        if self.current_idx < len(self.cards):
            mark_id = self.cards[self.current_idx]["mark_id"]
            db.rate_review(mark_id, rating)
            self.current_idx += 1
            self._load_card()
            self.review_completed.emit()

    def _show_done(self) -> None:
        self.progress_counter.setText("")
        self.card_frame.setVisible(False)
        for i in range(self.rating_layout.count()):
            self.rating_layout.itemAt(i).widget().setVisible(False)
        self.done_container.setVisible(True)
        self.review_completed.emit()
