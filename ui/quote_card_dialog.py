"""Quote Card preview and export dialog for Book Reader."""

from __future__ import annotations

import io
from pathlib import Path
from PyQt6.QtCore import Qt
from PyQt6.QtGui import QImage, QPixmap, QGuiApplication
from PyQt6.QtWidgets import (
    QDialog,
    QVBoxLayout,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QButtonGroup,
    QRadioButton,
    QFileDialog,
    QMessageBox,
    QWidget,
)
from core.quote_card import generate_quote_card


class QuoteCardDialog(QDialog):
    """Dialog allowing the user to preview a quote card in Dark, Light, or Sepia

    and save it as a 1080x1080 PNG or copy it to the clipboard.
    """

    def __init__(
        self,
        quote: str,
        title: str,
        author: str = "",
        parent: QWidget | None = None,
    ) -> None:
        super().__init__(parent)
        self.quote = quote
        self.title = title
        self.author = author
        self.current_template = "dark"
        self.current_pil_image = None

        self.setWindowTitle("Quote Card")
        self.setFixedSize(580, 720)
        self.setStyleSheet("""
            QDialog {
                background-color: #1A1714;
                color: #EDE4D3;
            }
            QLabel {
                color: #EDE4D3;
            }
            QRadioButton {
                color: #C4B38A;
                font-size: 13px;
                font-weight: 600;
                spacing: 6px;
            }
            QRadioButton::indicator {
                width: 16px;
                height: 16px;
                border-radius: 8px;
                border: 1px solid rgba(196, 179, 138, 0.4);
                background: #24201B;
            }
            QRadioButton::indicator:checked {
                background: #D4AF55;
                border: 1px solid #D4AF55;
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
        self._refresh_card()

    def _build_ui(self) -> None:
        layout = QVBoxLayout(self)
        layout.setContentsMargins(20, 20, 20, 20)
        layout.setSpacing(14)

        # Header Title
        title_label = QLabel("✦ Make Quote Card (1080×1080)")
        title_label.setStyleSheet("font-size: 15px; font-weight: 700; color: #D4AF55;")
        layout.addWidget(title_label)

        # Template Selection Row
        template_row = QHBoxLayout()
        template_row.setSpacing(16)
        template_label = QLabel("Template:")
        template_label.setStyleSheet("font-size: 13px; font-weight: 600; color: #8C7F6D;")
        template_row.addWidget(template_label)

        self.btn_group = QButtonGroup(self)
        for key, name in [("dark", "Dark"), ("light", "Light"), ("sepia", "Sepia")]:
            rb = QRadioButton(name)
            if key == self.current_template:
                rb.setChecked(True)
            rb.toggled.connect(lambda checked, k=key: self._on_template_toggled(k, checked))
            self.btn_group.addButton(rb)
            template_row.addWidget(rb)

        template_row.addStretch()
        layout.addLayout(template_row)

        # Image Preview Area
        self.preview_label = QLabel()
        self.preview_label.setFixedSize(520, 520)
        self.preview_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.preview_label.setStyleSheet("""
            QLabel {
                background-color: #141210;
                border: 1px solid rgba(196, 179, 138, 0.2);
                border-radius: 12px;
            }
        """)
        layout.addWidget(self.preview_label, alignment=Qt.AlignmentFlag.AlignCenter)

        # Bottom Actions: Copy to Clipboard, Save PNG, Close
        btn_row = QHBoxLayout()
        btn_row.setSpacing(10)

        self.copy_btn = QPushButton("📋 Copy to Clipboard")
        self.copy_btn.clicked.connect(self._copy_to_clipboard)
        btn_row.addWidget(self.copy_btn)

        self.save_btn = QPushButton("💾 Save PNG")
        self.save_btn.setObjectName("primaryBtn")
        self.save_btn.clicked.connect(self._save_png)
        btn_row.addWidget(self.save_btn)

        self.close_btn = QPushButton("Close")
        self.close_btn.clicked.connect(self.accept)
        btn_row.addWidget(self.close_btn)

        layout.addLayout(btn_row)

    def _on_template_toggled(self, template: str, checked: bool) -> None:
        if checked and template != self.current_template:
            self.current_template = template
            self._refresh_card()

    def _refresh_card(self) -> None:
        """Generate quote card with current template and display preview."""
        self.current_pil_image = generate_quote_card(
            quote=self.quote,
            title=self.title,
            author=self.author,
            template=self.current_template,
        )

        # Convert PIL RGBA to QImage
        raw_data = self.current_pil_image.tobytes("raw", "RGBA")
        qim = QImage(
            raw_data,
            self.current_pil_image.width,
            self.current_pil_image.height,
            QImage.Format.Format_RGBA8888,
        )
        pixmap = QPixmap.fromImage(qim)

        # Scale down smoothly for 520x520 preview
        scaled_pixmap = pixmap.scaled(
            520,
            520,
            Qt.AspectRatioMode.KeepAspectRatio,
            Qt.TransformationMode.SmoothTransformation,
        )
        self.preview_label.setPixmap(scaled_pixmap)

    def _get_qimage(self) -> QImage:
        """Return the current full 1080x1080 QImage."""
        raw_data = self.current_pil_image.tobytes("raw", "RGBA")
        return QImage(
            raw_data,
            self.current_pil_image.width,
            self.current_pil_image.height,
            QImage.Format.Format_RGBA8888,
        )

    def _copy_to_clipboard(self) -> None:
        """Copy the 1080x1080 PNG image to the system clipboard."""
        if not self.current_pil_image:
            return
        clipboard = QGuiApplication.clipboard()
        qimage = self._get_qimage()
        clipboard.setImage(qimage)

        QMessageBox.information(
            self,
            "Copied",
            "Quote card copied to clipboard! You can paste it into chats, documents, or social media.",
        )

    def _save_png(self) -> None:
        """Save the 1080x1080 PNG file."""
        if not self.current_pil_image:
            return
        clean_title = "".join(c for c in self.title if c.isalnum() or c in " _-").strip() or "quote"
        default_filename = f"Quote_{clean_title[:30]}_{self.current_template}.png"

        filepath, _ = QFileDialog.getSaveFileName(
            self,
            "Save Quote Card",
            default_filename,
            "PNG Images (*.png);;All Files (*.*)",
        )
        if not filepath:
            return

        try:
            self.current_pil_image.save(filepath, "PNG")
            QMessageBox.information(
                self,
                "Saved",
                f"Quote card saved successfully to:\n{filepath}",
            )
        except Exception as exc:
            QMessageBox.critical(self, "Save Error", f"Could not save quote card:\n{exc}")
