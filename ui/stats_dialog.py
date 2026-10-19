"""Reading stats dialog, 7-day bar chart, and circular progress ring."""

from __future__ import annotations

import math
from datetime import datetime, timedelta
from PyQt6.QtCore import Qt, pyqtSignal, QRectF
from PyQt6.QtGui import QPainter, QColor, QPen, QBrush, QFont
from PyQt6.QtWidgets import (
    QDialog,
    QVBoxLayout,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QWidget,
    QFrame,
    QScrollArea,
    QSpinBox,
)

import db
from core import settings_manager


class GoalProgressRing(QWidget):
    """Circular progress ring widget displayed in the top bar.

    Clicking it emits `clicked` signal to open the stats dialog.
    """

    clicked = pyqtSignal()

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setFixedSize(54, 40)
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self.today_minutes = 0.0
        self.goal_minutes = settings_manager.get_setting("daily_goal_minutes", 15)
        self.setToolTip("Daily Goal Progress. Click to open Stats.")

    def set_progress(self, today_minutes: float, goal_minutes: int | None = None) -> None:
        self.today_minutes = today_minutes
        if goal_minutes is not None:
            self.goal_minutes = max(1, goal_minutes)
        pct = min(100, int((self.today_minutes / self.goal_minutes) * 100)) if self.goal_minutes else 0
        self.setToolTip(f"Daily Goal: {self.today_minutes:.0f}/{self.goal_minutes} mins ({pct}%). Click to open Stats.")
        self.update()

    def mousePressEvent(self, event) -> None:
        if event.button() == Qt.MouseButton.LeftButton:
            self.clicked.emit()
        super().mousePressEvent(event)

    def paintEvent(self, event) -> None:
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)

        # Bounding box for ring
        ring_rect = QRectF(4, 3, 34, 34)
        center_x = ring_rect.center().x()
        center_y = ring_rect.center().y()

        # Background track
        pen_bg = QPen(QColor(60, 52, 42), 3)
        painter.setPen(pen_bg)
        painter.setBrush(Qt.BrushStyle.NoBrush)
        painter.drawEllipse(ring_rect)

        # Progress Arc
        fraction = min(1.0, self.today_minutes / max(1, self.goal_minutes))
        span_angle = int(fraction * 360 * 16)
        if span_angle > 0:
            pen_fg = QPen(QColor("#D4AF55"), 3.5)
            pen_fg.setCapStyle(Qt.PenCapStyle.RoundCap)
            painter.setPen(pen_fg)
            # Qt start angle 90*16 is top (12 o'clock); negative span is clockwise
            painter.drawArc(ring_rect, 90 * 16, -span_angle)

        # Center text (e.g. "12m")
        painter.setPen(QColor("#EDE4D3"))
        font = QFont("Segoe UI", 8, QFont.Weight.Bold)
        painter.setFont(font)
        m_str = f"{int(self.today_minutes)}m"
        painter.drawText(ring_rect, Qt.AlignmentFlag.AlignCenter, m_str)
        painter.end()


class SevenDayBarChart(QWidget):
    """Custom painted 7-day reading time bar chart."""

    def __init__(self, daily_minutes: dict[str, float], parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setFixedHeight(160)
        self.daily_minutes = daily_minutes

    def paintEvent(self, event) -> None:
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)

        w = self.width()
        h = self.height()
        chart_h = h - 35  # leave room for labels
        today_str = datetime.now().strftime("%Y-%m-%d")

        # Generate last 7 dates
        dates = [(datetime.now() - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(6, -1, -1)]
        max_mins = max([self.daily_minutes.get(d, 0.0) for d in dates] + [15.0])

        slot_w = w / 7.0
        bar_w = min(36.0, slot_w - 12.0)

        for i, d in enumerate(dates):
            mins = self.daily_minutes.get(d, 0.0)
            bar_height = max(4.0, (mins / max_mins) * (chart_h - 20))
            x = i * slot_w + (slot_w - bar_w) / 2.0
            y = chart_h - bar_height

            is_today = (d == today_str)

            # Draw bar
            color = QColor("#D4AF55") if is_today else QColor(164, 147, 114, 180)
            painter.setPen(Qt.PenStyle.NoPen)
            painter.setBrush(QBrush(color))
            painter.drawRoundedRect(QRectF(x, y, bar_w, bar_height), 4, 4)

            # Draw minutes on top of bar
            painter.setPen(QColor("#C4B38A" if not is_today else "#D4AF55"))
            font_min = QFont("Segoe UI", 8, QFont.Weight.Bold if is_today else QFont.Weight.Normal)
            painter.setFont(font_min)
            min_str = f"{int(mins)}m" if mins > 0 else "0"
            painter.drawText(QRectF(x - 10, y - 16, bar_w + 20, 14), Qt.AlignmentFlag.AlignCenter, min_str)

            # Draw Day label below bar
            dt = datetime.strptime(d, "%Y-%m-%d")
            day_name = "Today" if is_today else dt.strftime("%a")
            painter.setPen(QColor("#EDE4D3" if is_today else "#7A6F5E"))
            font_day = QFont("Segoe UI", 9, QFont.Weight.Bold if is_today else QFont.Weight.Normal)
            painter.setFont(font_day)
            painter.drawText(QRectF(x - 10, chart_h + 8, bar_w + 20, 18), Qt.AlignmentFlag.AlignCenter, day_name)

        painter.end()


class StatsDialog(QDialog):
    """Screen displaying reading statistics, streak, pace, 7-day bar chart, and goal settings."""

    goal_updated = pyqtSignal(int)

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setWindowTitle("📊 Reading Stats & Daily Goal")
        self.resize(680, 640)
        self.setStyleSheet("""
            QDialog {
                background-color: #1A1714;
                color: #EDE4D3;
            }
            QLabel {
                color: #EDE4D3;
            }
            QFrame#card {
                background-color: #23201C;
                border: 1px solid rgba(196, 179, 138, 0.2);
                border-radius: 10px;
                padding: 14px;
            }
            QSpinBox {
                background-color: #23201C;
                color: #EDE4D3;
                border: 1px solid rgba(196, 179, 138, 0.3);
                border-radius: 6px;
                padding: 6px 10px;
                font-size: 14px;
                font-weight: bold;
            }
            QPushButton {
                background-color: #24201B;
                color: #EDE4D3;
                border: 1px solid rgba(196, 179, 138, 0.25);
                border-radius: 8px;
                padding: 8px 18px;
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
        layout.setContentsMargins(28, 22, 28, 22)
        layout.setSpacing(16)

        # Header row
        header_row = QHBoxLayout()
        title_lbl = QLabel("📊  Reading Stats")
        title_lbl.setStyleSheet("font-size: 20px; font-weight: bold; color: #D4AF55; font-family: Georgia, serif;")
        header_row.addWidget(title_lbl)
        header_row.addStretch()

        close_btn = QPushButton("✕")
        close_btn.setFixedSize(32, 32)
        close_btn.clicked.connect(self.accept)
        header_row.addWidget(close_btn)
        layout.addLayout(header_row)

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.Shape.NoFrame)
        scroll.setStyleSheet("background: transparent; border: none;")

        content = QWidget()
        content_layout = QVBoxLayout(content)
        content_layout.setContentsMargins(0, 0, 0, 0)
        content_layout.setSpacing(16)

        # Compute statistics
        sessions = db.get_sessions()
        all_books = db.get_all_books()
        book_title_map = {b["id"]: b.get("title", "Untitled") for b in all_books}

        today_str = datetime.now().strftime("%Y-%m-%d")
        daily_seconds: dict[str, float] = {}
        book_seconds: dict[str, float] = {}

        for s in sessions:
            dt_str = s.get("start", "")[:10]
            secs = float(s.get("seconds", 0))
            bid = s.get("book_id", "")
            daily_seconds[dt_str] = daily_seconds.get(dt_str, 0.0) + secs
            book_seconds[bid] = book_seconds.get(bid, 0.0) + secs

        today_mins = daily_seconds.get(today_str, 0.0) / 60.0

        # Calculate streak (consecutive days with reading >= 60 seconds)
        streak = 0
        cur_date = datetime.now().date()
        # If no reading today yet, allow streak to continue from yesterday
        if daily_seconds.get(cur_date.strftime("%Y-%m-%d"), 0) < 60:
            cur_date -= timedelta(days=1)

        while True:
            d_key = cur_date.strftime("%Y-%m-%d")
            if daily_seconds.get(d_key, 0) >= 60:
                streak += 1
                cur_date -= timedelta(days=1)
            else:
                break

        # ── KPI Cards Row (Today's minutes & Current streak) ──────────
        kpi_row = QHBoxLayout()
        kpi_row.setSpacing(14)

        today_card = QFrame()
        today_card.setObjectName("card")
        tc_layout = QVBoxLayout(today_card)
        tc_lbl = QLabel("TODAY'S READING")
        tc_lbl.setStyleSheet("font-size: 11px; color: #7A6F5E; font-weight: bold; letter-spacing: 1px;")
        tc_val = QLabel(f"{today_mins:.0f} mins")
        tc_val.setStyleSheet("font-size: 26px; font-weight: bold; color: #D4AF55; font-family: Georgia, serif;")
        tc_layout.addWidget(tc_lbl)
        tc_layout.addWidget(tc_val)
        kpi_row.addWidget(today_card)

        streak_card = QFrame()
        streak_card.setObjectName("card")
        sc_layout = QVBoxLayout(streak_card)
        sc_lbl = QLabel("CURRENT STREAK")
        sc_lbl.setStyleSheet("font-size: 11px; color: #7A6F5E; font-weight: bold; letter-spacing: 1px;")
        sc_val = QLabel(f"🔥 {streak} {'day' if streak == 1 else 'days'}")
        sc_val.setStyleSheet("font-size: 26px; font-weight: bold; color: #E5A93C; font-family: Georgia, serif;")
        sc_layout.addWidget(sc_lbl)
        sc_layout.addWidget(sc_val)
        kpi_row.addWidget(streak_card)

        content_layout.addLayout(kpi_row)

        # ── 7-Day Bar Chart ──────────────────────────────────────────
        chart_card = QFrame()
        chart_card.setObjectName("card")
        cc_layout = QVBoxLayout(chart_card)
        cc_title = QLabel("LAST 7 DAYS ACTIVITY")
        cc_title.setStyleSheet("font-size: 12px; color: #7A6F5E; font-weight: bold; letter-spacing: 1px;")
        cc_layout.addWidget(cc_title)

        daily_mins = {d: s / 60.0 for d, s in daily_seconds.items()}
        bar_chart = SevenDayBarChart(daily_mins)
        cc_layout.addWidget(bar_chart)
        content_layout.addWidget(chart_card)

        # ── Daily Goal Setting Card ──────────────────────────────────
        goal_card = QFrame()
        goal_card.setObjectName("card")
        gc_layout = QHBoxLayout(goal_card)
        gc_layout.setContentsMargins(14, 10, 14, 10)

        gc_info = QVBoxLayout()
        gc_title = QLabel("🎯  Daily Reading Goal")
        gc_title.setStyleSheet("font-size: 14px; font-weight: bold; color: #EDE4D3;")
        gc_sub = QLabel("Target reading minutes each day to build consistency.")
        gc_sub.setStyleSheet("font-size: 12px; color: #7A6F5E;")
        gc_info.addWidget(gc_title)
        gc_info.addWidget(gc_sub)
        gc_layout.addLayout(gc_info, 1)

        self.goal_spin = QSpinBox()
        self.goal_spin.setRange(1, 300)
        cur_goal = settings_manager.get_setting("daily_goal_minutes", 15)
        self.goal_spin.setValue(cur_goal)
        self.goal_spin.setSuffix(" min")
        gc_layout.addWidget(self.goal_spin)

        save_goal_btn = QPushButton("Save")
        save_goal_btn.setObjectName("primaryBtn")
        save_goal_btn.clicked.connect(self._save_goal)
        gc_layout.addWidget(save_goal_btn)

        content_layout.addWidget(goal_card)

        # ── Reading Time per Book & Finish Date Estimate ─────────────
        books_card = QFrame()
        books_card.setObjectName("card")
        bc_layout = QVBoxLayout(books_card)
        bc_title = QLabel("MINUTES PER BOOK & ESTIMATED FINISH")
        bc_title.setStyleSheet("font-size: 12px; color: #7A6F5E; font-weight: bold; letter-spacing: 1px;")
        bc_layout.addWidget(bc_title)

        # Calculate user's pace: average daily reading minutes over last 7 days
        last_7_dates = [(datetime.now() - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(7)]
        last_7_mins = sum(daily_mins.get(d, 0.0) for d in last_7_dates)
        daily_pace = max(5.0, last_7_mins / 7.0)  # default to at least 5 mins/day pace

        if not all_books:
            no_books = QLabel("No books added yet.")
            no_books.setStyleSheet("color: #7A6F5E; font-size: 13px;")
            bc_layout.addWidget(no_books)
        else:
            for b in all_books:
                bid = b["id"]
                title = b.get("title", "Untitled")
                mins = book_seconds.get(bid, 0.0) / 60.0

                b_row = QHBoxLayout()
                b_lbl = QLabel(f"📖  {title}")
                b_lbl.setStyleSheet("color: #EDE4D3; font-size: 13px; font-weight: 500;")
                b_row.addWidget(b_lbl, 1)

                m_lbl = QLabel(f"{mins:.0f} mins read")
                m_lbl.setStyleSheet("color: #D4AF55; font-size: 12px; font-weight: bold;")
                b_row.addWidget(m_lbl)

                # Estimate finish date if pace > 0
                days_left = max(1, int(180 / daily_pace))  # estimated remaining reading
                est_finish = (datetime.now() + timedelta(days=days_left)).strftime("%b %d, %Y")
                est_lbl = QLabel(f"Est: {est_finish}")
                est_lbl.setStyleSheet("color: #7A6F5E; font-size: 11px;")
                b_row.addWidget(est_lbl)

                bc_layout.addLayout(b_row)

        content_layout.addWidget(books_card)

        scroll.setWidget(content)
        layout.addWidget(scroll, 1)

    def _save_goal(self) -> None:
        val = self.goal_spin.value()
        settings_manager.set_setting("daily_goal_minutes", val)
        self.goal_updated.emit(val)
