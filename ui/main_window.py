import sys
from datetime import datetime

import PyQt6.QtWebEngineWidgets  # Must import before QCoreApplication
from PyQt6.QtCore import QEvent, QTimer, Qt, QSize
from PyQt6.QtGui import QAction, QColor, QFont, QIcon, QPainter, QPalette, QPixmap
from PyQt6.QtWidgets import (
    QApplication,
    QFileDialog,
    QFrame,
    QGraphicsDropShadowEffect,
    QHBoxLayout,
    QLabel,
    QListWidget,
    QListWidgetItem,
    QMainWindow,
    QMenu,
    QMessageBox,
    QProgressBar,
    QPushButton,
    QSplitter,
    QStackedWidget,
    QTabWidget,
    QVBoxLayout,
    QWidget,
)

from core import book_loader, database, settings_manager
import db as db_module
from core.models import Book
from core.indexer import IndexWorker
from ui.library_widget import LibraryWidget
from ui.reader_widget import ReaderWidget
from ui.search_widget import SearchPanel
from ui.review_dialog import ReviewDialog
from ui.action_dialog import ActionsListDialog
from ui.dictionary_dialog import VocabularyListDialog
from ui.stats_dialog import StatsDialog, GoalProgressRing

# ── Color palette ─────────────────────────────────────────────────────
SIDEBAR_BG = "#1A1714"
SIDEBAR_DARKER = "#13110E"
SIDEBAR_TEXT = "#C4B38A"
SIDEBAR_TEXT_DIM = "#7A6F5E"
SIDEBAR_ACCENT = "#D4AF55"
SIDEBAR_HOVER = "rgba(212, 175, 85, 0.08)"
SIDEBAR_SELECTED = "rgba(212, 175, 85, 0.15)"
HEADER_BG = "#1E1B16"
HEADER_BORDER = "rgba(196, 179, 138, 0.15)"
OUTER_BG = "#141210"
TAB_BG = "#1E1B16"

# ── Global stylesheet ────────────────────────────────────────────────
APP_STYLESHEET = f"""
    QMainWindow {{
        background: {OUTER_BG};
    }}
    QMenuBar {{
        background: {SIDEBAR_BG};
        color: {SIDEBAR_TEXT};
        border-bottom: 1px solid {HEADER_BORDER};
        padding: 4px 8px;
        font-size: 13px;
    }}
    QMenuBar::item {{
        padding: 6px 14px;
        border-radius: 4px;
    }}
    QMenuBar::item:selected {{
        background: {SIDEBAR_HOVER};
    }}
    QMenu {{
        background: #2A2520;
        color: #E8DCC6;
        border: 1px solid rgba(196, 179, 138, 0.25);
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
        background: rgba(196, 179, 138, 0.18);
    }}
    QMenu::separator {{
        height: 1px;
        background: rgba(196, 179, 138, 0.12);
        margin: 4px 12px;
    }}
    QSplitter::handle {{
        background: rgba(196, 179, 138, 0.1);
        width: 1px;
    }}
"""


class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("✦  Book Reader")
        self.resize(1280, 860)
        self.current_book: Book | None = None
        self._index_worker: IndexWorker | None = None

        # Settings & State
        self.theme = settings_manager.get_setting("theme", "Sepia")
        self.font_size = settings_manager.get_setting("font_size", 18)
        self.line_width = settings_manager.get_setting("line_width", 720)
        self._focus_mode = False

        # Inactivity & Reading session tracking (Feature 11)
        self._last_active_time = datetime.now()
        self._session_start_time = None
        self._session_active_seconds = 0
        self._session_timer = QTimer(self)
        self._session_timer.timeout.connect(self._on_session_tick)
        self._session_timer.start(1000)

        # Install event filter to detect user activity
        app = QApplication.instance()
        if app:
            app.installEventFilter(self)

        database.init_db()
        self._build_ui()
        self._build_menu()
        self._refresh_library()
        self.stack.setCurrentIndex(0)

        self.autosave_timer = QTimer(self)
        self.autosave_timer.timeout.connect(self._save_progress)
        self.autosave_timer.start(3000)

    def _build_ui(self) -> None:
        self.stack = QStackedWidget()
        self.setCentralWidget(self.stack)

        # ── Page 0: Library home screen ──────────────────────────────
        self.library_screen = LibraryWidget()
        self.library_screen.book_opened.connect(self.open_book)
        self.stack.addWidget(self.library_screen)

        # ── Page 1: Reader screen ────────────────────────────────────
        reader_page = QWidget()
        reader_page_layout = QHBoxLayout(reader_page)
        reader_page_layout.setContentsMargins(0, 0, 0, 0)
        reader_page_layout.setSpacing(0)

        splitter = QSplitter()
        splitter.setHandleWidth(1)
        reader_page_layout.addWidget(splitter)
        self.stack.addWidget(reader_page)

        # ── Left sidebar ──────────────────────────────────────────────
        self.left_sidebar = QWidget()
        self.left_sidebar.setMaximumWidth(320)
        self.left_sidebar.setMinimumWidth(260)
        self.left_sidebar.setStyleSheet(f"background: {SIDEBAR_BG};")
        left_layout = QVBoxLayout(self.left_sidebar)
        left_layout.setContentsMargins(0, 0, 0, 0)
        left_layout.setSpacing(0)

        # App logo / title area
        logo_area = QWidget()
        logo_area.setStyleSheet(f"""
            background: {SIDEBAR_DARKER};
            border-bottom: 1px solid {HEADER_BORDER};
        """)
        logo_layout = QVBoxLayout(logo_area)
        logo_layout.setContentsMargins(20, 18, 20, 14)

        app_title = QLabel("📚  Book Reader")
        app_title.setStyleSheet(f"""
            color: {SIDEBAR_ACCENT};
            font-size: 18px;
            font-weight: bold;
            letter-spacing: 1px;
            font-family: Georgia, serif;
        """)
        logo_layout.addWidget(app_title)

        app_subtitle = QLabel("Your personal library")
        app_subtitle.setStyleSheet(f"""
            color: {SIDEBAR_TEXT_DIM};
            font-size: 11px;
            letter-spacing: 2px;
            text-transform: uppercase;
            margin-top: 2px;
        """)
        logo_layout.addWidget(app_subtitle)
        left_layout.addWidget(logo_area)

        # Library section header
        lib_header = QWidget()
        lib_header.setStyleSheet(f"background: {SIDEBAR_BG};")
        lib_header_layout = QHBoxLayout(lib_header)
        lib_header_layout.setContentsMargins(20, 14, 16, 8)

        library_label = QLabel("LIBRARY")
        library_label.setStyleSheet(f"""
            color: {SIDEBAR_TEXT_DIM};
            font-size: 11px;
            font-weight: bold;
            letter-spacing: 2.5px;
        """)
        lib_header_layout.addWidget(library_label)
        lib_header_layout.addStretch()
        left_layout.addWidget(lib_header)

        # Library list
        self.library_list = QListWidget()
        self.library_list.setStyleSheet(f"""
            QListWidget {{
                background: {SIDEBAR_BG};
                border: none;
                padding: 4px 8px;
                outline: none;
            }}
            QListWidget::item {{
                color: {SIDEBAR_TEXT};
                padding: 12px 14px;
                border-radius: 8px;
                margin: 2px 0;
                font-size: 13px;
            }}
            QListWidget::item:hover {{
                background: {SIDEBAR_HOVER};
            }}
            QListWidget::item:selected {{
                background: {SIDEBAR_SELECTED};
                color: {SIDEBAR_ACCENT};
            }}
            QScrollBar:vertical {{
                background: {SIDEBAR_BG};
                width: 6px;
                margin: 2px;
                border-radius: 3px;
            }}
            QScrollBar::handle:vertical {{
                background: rgba(196, 179, 138, 0.2);
                min-height: 20px;
                border-radius: 3px;
            }}
            QScrollBar::handle:vertical:hover {{
                background: rgba(196, 179, 138, 0.35);
            }}
            QScrollBar::add-line:vertical,
            QScrollBar::sub-line:vertical {{
                height: 0px;
            }}
        """)
        self.library_list.itemDoubleClicked.connect(self._open_selected_book)
        left_layout.addWidget(self.library_list, 1)

        # Open book button
        btn_container = QWidget()
        btn_container.setStyleSheet(f"background: {SIDEBAR_BG};")
        btn_layout = QVBoxLayout(btn_container)
        btn_layout.setContentsMargins(14, 8, 14, 10)

        open_btn = QPushButton("＋  Add Book")
        open_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        open_btn.setStyleSheet(f"""
            QPushButton {{
                background: rgba(212, 175, 85, 0.12);
                color: {SIDEBAR_ACCENT};
                border: 1px solid rgba(212, 175, 85, 0.25);
                border-radius: 8px;
                padding: 11px 20px;
                font-size: 13px;
                font-weight: 600;
                letter-spacing: 0.5px;
            }}
            QPushButton:hover {{
                background: rgba(212, 175, 85, 0.22);
                border-color: rgba(212, 175, 85, 0.45);
            }}
            QPushButton:pressed {{
                background: rgba(212, 175, 85, 0.08);
            }}
        """)
        open_btn.clicked.connect(self.open_book_dialog)
        btn_layout.addWidget(open_btn)
        left_layout.addWidget(btn_container)

        # Separator line
        sep = QFrame()
        sep.setFrameShape(QFrame.Shape.HLine)
        sep.setStyleSheet(f"background: {HEADER_BORDER}; max-height: 1px;")
        left_layout.addWidget(sep)

        # Side tabs (Highlights & Vocabulary)
        self.side_tabs = QTabWidget()
        self.side_tabs.setStyleSheet(f"""
            QTabWidget::pane {{
                background: {SIDEBAR_BG};
                border: none;
                border-top: 1px solid {HEADER_BORDER};
            }}
            QTabBar {{
                background: {SIDEBAR_BG};
            }}
            QTabBar::tab {{
                background: transparent;
                color: {SIDEBAR_TEXT_DIM};
                padding: 10px 18px;
                font-size: 11px;
                font-weight: bold;
                letter-spacing: 1.5px;
                border-bottom: 2px solid transparent;
                text-transform: uppercase;
            }}
            QTabBar::tab:selected {{
                color: {SIDEBAR_ACCENT};
                border-bottom: 2px solid {SIDEBAR_ACCENT};
            }}
            QTabBar::tab:hover {{
                color: {SIDEBAR_TEXT};
            }}
        """)

        list_style = f"""
            QListWidget {{
                background: {SIDEBAR_BG};
                border: none;
                padding: 4px 8px;
                outline: none;
            }}
            QListWidget::item {{
                color: {SIDEBAR_TEXT};
                padding: 10px 12px;
                border-radius: 6px;
                margin: 2px 0;
                font-size: 12px;
                line-height: 1.4;
            }}
            QListWidget::item:hover {{
                background: {SIDEBAR_HOVER};
            }}
            QListWidget::item:selected {{
                background: {SIDEBAR_SELECTED};
                color: {SIDEBAR_ACCENT};
            }}
            QScrollBar:vertical {{
                background: {SIDEBAR_BG};
                width: 6px;
                margin: 2px;
                border-radius: 3px;
            }}
            QScrollBar::handle:vertical {{
                background: rgba(196, 179, 138, 0.2);
                min-height: 20px;
                border-radius: 3px;
            }}
            QScrollBar::add-line:vertical,
            QScrollBar::sub-line:vertical {{
                height: 0px;
            }}
        """

        self.bookmarks_list = QListWidget()
        self.bookmarks_list.setStyleSheet(list_style)
        self.bookmarks_list.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
        self.bookmarks_list.customContextMenuRequested.connect(self._show_bookmark_context_menu)
        self.bookmarks_list.itemClicked.connect(self._jump_to_bookmark)

        self.highlights_list = QListWidget()
        self.highlights_list.setStyleSheet(list_style)
        self.highlights_list.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
        self.highlights_list.customContextMenuRequested.connect(self._show_highlight_context_menu)
        self.highlights_list.itemClicked.connect(self._jump_to_highlight)

        self.vocabulary_list = QListWidget()
        self.vocabulary_list.setStyleSheet(list_style)
        self.vocabulary_list.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
        self.vocabulary_list.customContextMenuRequested.connect(self._show_vocabulary_context_menu)
        self.vocabulary_list.itemClicked.connect(self._jump_to_word)

        self.marks_list = QListWidget()
        self.marks_list.setStyleSheet(list_style)
        self.marks_list.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
        self.marks_list.customContextMenuRequested.connect(self._show_mark_context_menu)
        self.marks_list.itemClicked.connect(self._jump_to_mark)

        self.side_tabs.addTab(self.bookmarks_list, "BOOKMARKS")
        self.side_tabs.addTab(self.marks_list, "MARKS")
        self.side_tabs.addTab(self.highlights_list, "HIGHLIGHTS")
        self.side_tabs.addTab(self.vocabulary_list, "VOCABULARY")

        self.actions_list = QListWidget()
        self.actions_list.setStyleSheet(list_style)
        self.actions_list.itemClicked.connect(self._on_action_item_clicked)
        self.side_tabs.addTab(self.actions_list, "ACTIONS")

        left_layout.addWidget(self.side_tabs, 1)

        splitter.addWidget(self.left_sidebar)

        # ── Right panel: book reader ──────────────────────────────────
        reader_container = QWidget()
        reader_container.setStyleSheet(f"background: {OUTER_BG};")
        reader_layout = QVBoxLayout(reader_container)
        reader_layout.setContentsMargins(0, 0, 0, 0)
        reader_layout.setSpacing(0)

        # Book title header bar
        self.reader_header = QWidget()
        self.reader_header.setStyleSheet(f"""
            background: {HEADER_BG};
            border-bottom: 1px solid {HEADER_BORDER};
        """)
        header_layout = QHBoxLayout(self.reader_header)
        header_layout.setContentsMargins(20, 10, 20, 10)

        # Back to library button
        self.back_to_lib_btn = QPushButton("◂  Back")
        self.back_to_lib_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.back_to_lib_btn.setStyleSheet(f"""
            QPushButton {{
                background: rgba(212, 175, 85, 0.12);
                color: {SIDEBAR_ACCENT};
                border: 1px solid rgba(212, 175, 85, 0.25);
                border-radius: 6px;
                padding: 6px 12px;
                font-size: 12px;
                font-weight: 600;
            }}
            QPushButton:hover {{
                background: rgba(212, 175, 85, 0.22);
                border-color: rgba(212, 175, 85, 0.45);
            }}
        """)
        self.back_to_lib_btn.clicked.connect(self.show_library)
        header_layout.addWidget(self.back_to_lib_btn)
        header_layout.addSpacing(10)

        self.book_title_label = QLabel("Open a book to begin reading")
        self.book_title_label.setStyleSheet(f"""
            color: {SIDEBAR_TEXT};
            font-size: 14px;
            font-weight: 600;
            font-family: Georgia, 'Palatino Linotype', serif;
        """)
        header_layout.addWidget(self.book_title_label, 1)

        self.progress_label = QLabel("")
        self.progress_label.setStyleSheet(f"""
            color: {SIDEBAR_ACCENT};
            font-size: 11px;
            letter-spacing: 1.5px;
            font-weight: 500;
        """)
        header_layout.addWidget(self.progress_label)
        header_layout.addSpacing(12)

        btn_header_style = f"""
            QPushButton {{
                background: rgba(196, 179, 138, 0.08);
                color: {SIDEBAR_TEXT};
                border: 1px solid rgba(196, 179, 138, 0.22);
                border-radius: 6px;
                padding: 5px 10px;
                font-size: 12px;
                font-weight: 600;
            }}
            QPushButton:hover {{
                background: rgba(212, 175, 85, 0.18);
                color: {SIDEBAR_ACCENT};
                border-color: rgba(212, 175, 85, 0.45);
            }}
        """

        # Font size controls (A- and A+)
        self.font_down_btn = QPushButton("A-")
        self.font_down_btn.setStyleSheet(btn_header_style)
        self.font_down_btn.setToolTip("Decrease Font Size")
        self.font_down_btn.clicked.connect(self._font_size_down)
        header_layout.addWidget(self.font_down_btn)

        self.font_up_btn = QPushButton("A+")
        self.font_up_btn.setStyleSheet(btn_header_style)
        self.font_up_btn.setToolTip("Increase Font Size")
        self.font_up_btn.clicked.connect(self._font_size_up)
        header_layout.addWidget(self.font_up_btn)
        header_layout.addSpacing(6)

        # Theme selector button
        self.theme_btn = QPushButton(f"🎨  {self.theme}")
        self.theme_btn.setStyleSheet(btn_header_style)
        self.theme_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        theme_menu = QMenu(self.theme_btn)
        for t_name in ["Light", "Sepia", "Dark"]:
            act = theme_menu.addAction(t_name)
            act.triggered.connect(lambda ch, t=t_name: self._change_theme(t))
        self.theme_btn.setMenu(theme_menu)
        header_layout.addWidget(self.theme_btn)
        header_layout.addSpacing(6)

        # Focus Mode button (toggled with F key)
        self.focus_btn = QPushButton("⛶  Focus (F)")
        self.focus_btn.setCheckable(True)
        self.focus_btn.setStyleSheet(f"""
            QPushButton {{
                background: rgba(196, 179, 138, 0.08);
                color: {SIDEBAR_TEXT};
                border: 1px solid rgba(196, 179, 138, 0.22);
                border-radius: 6px;
                padding: 5px 12px;
                font-size: 12px;
                font-weight: 600;
            }}
            QPushButton:checked {{
                background: rgba(212, 175, 85, 0.25);
                color: {SIDEBAR_ACCENT};
                border-color: {SIDEBAR_ACCENT};
            }}
            QPushButton:hover {{
                background: rgba(212, 175, 85, 0.18);
                color: {SIDEBAR_ACCENT};
            }}
        """)
        self.focus_btn.clicked.connect(self._toggle_focus_mode)
        header_layout.addWidget(self.focus_btn)
        header_layout.addSpacing(6)

        # Export marks button
        self.export_btn = QPushButton("💾  Export")
        self.export_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.export_btn.setToolTip("Export all marks for this book to Markdown")
        self.export_btn.setStyleSheet(btn_header_style)
        self.export_btn.setEnabled(False)
        self.export_btn.clicked.connect(self._export_marks_current_book)
        header_layout.addWidget(self.export_btn)
        header_layout.addSpacing(6)

        # Search toggle button
        self.search_btn = QPushButton("🔍  Search")
        self.search_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.search_btn.setToolTip("Search inside this book or all books (Ctrl+F)")
        self.search_btn.setCheckable(True)
        self.search_btn.setStyleSheet(f"""
            QPushButton {{
                background: rgba(196, 179, 138, 0.08);
                color: {SIDEBAR_TEXT};
                border: 1px solid rgba(196, 179, 138, 0.22);
                border-radius: 6px;
                padding: 5px 12px;
                font-size: 12px;
                font-weight: 600;
            }}
            QPushButton:checked {{
                background: rgba(212, 175, 85, 0.18);
                color: {SIDEBAR_ACCENT};
                border-color: rgba(212, 175, 85, 0.45);
            }}
            QPushButton:hover {{
                background: rgba(196, 179, 138, 0.16);
                color: {SIDEBAR_TEXT};
            }}
        """)
        self.search_btn.toggled.connect(self._toggle_search)
        header_layout.addWidget(self.search_btn)
        header_layout.addSpacing(6)

        # Top bar Goal Progress Ring
        self.reader_ring = GoalProgressRing()
        self.reader_ring.clicked.connect(self._open_stats)
        header_layout.addWidget(self.reader_ring)

        reader_layout.addWidget(self.reader_header)

        # Search panel (hidden by default, slides in below header)
        self.search_panel = SearchPanel()
        self.search_panel.result_activated.connect(self._on_search_result)
        self.search_panel.closed.connect(lambda: self.search_btn.setChecked(False))
        reader_layout.addWidget(self.search_panel)

        # The reader widget
        self.reader = ReaderWidget()
        self.reader.highlight_added.connect(self._refresh_highlights)
        self.reader.word_saved.connect(self._refresh_vocabulary)
        self.reader.mark_added.connect(self._refresh_marks)
        reader_layout.addWidget(self.reader, 1)

        # Focus mode thin bottom progress line (3px gold line)
        self.focus_progress_bar = QProgressBar()
        self.focus_progress_bar.setFixedHeight(3)
        self.focus_progress_bar.setTextVisible(False)
        self.focus_progress_bar.setStyleSheet("""
            QProgressBar {
                background: rgba(255, 255, 255, 0.08);
                border: none;
            }
            QProgressBar::chunk {
                background: #D4AF55;
            }
        """)
        self.focus_progress_bar.hide()
        reader_layout.addWidget(self.focus_progress_bar)

        splitter.addWidget(reader_container)
        splitter.setStretchFactor(1, 1)

    def _build_menu(self) -> None:
        menubar = self.menuBar()

        file_menu = menubar.addMenu("  File  ")
        lib_action = QAction("Library Screen", self)
        lib_action.setShortcut("Ctrl+L")
        lib_action.triggered.connect(self.show_library)
        file_menu.addAction(lib_action)
        open_action = QAction("Open Book...", self)
        open_action.setShortcut("Ctrl+O")
        open_action.triggered.connect(self.open_book_dialog)
        file_menu.addAction(open_action)
        file_menu.addSeparator()
        quit_action = QAction("Quit", self)
        quit_action.setShortcut("Ctrl+Q")
        quit_action.triggered.connect(self.close)
        file_menu.addAction(quit_action)

        bookmark_menu = menubar.addMenu("  Bookmark  ")
        save_bm = QAction("Save Bookmark Position", self)
        save_bm.setShortcut("Ctrl+B")
        save_bm.triggered.connect(self._save_bookmark)
        bookmark_menu.addAction(save_bm)

        go_bm = QAction("Go to Saved Position", self)
        go_bm.setShortcut("Ctrl+Shift+B")
        go_bm.triggered.connect(self._restore_progress)
        bookmark_menu.addAction(go_bm)

        # View menu
        view_menu = menubar.addMenu("  View  ")
        focus_act = QAction("Toggle Focus Mode", self)
        focus_act.setShortcut("F")
        focus_act.triggered.connect(self._toggle_focus_mode)
        view_menu.addAction(focus_act)

        theme_menu = view_menu.addMenu("Theme")
        for t_name in ["Light", "Sepia", "Dark"]:
            t_act = QAction(t_name, self)
            t_act.triggered.connect(lambda ch, t=t_name: self._change_theme(t))
            theme_menu.addAction(t_act)

        # Tools menu
        tools_menu = menubar.addMenu("  Tools  ")
        review_act = QAction("🎯  Daily Review", self)
        review_act.setShortcut("Ctrl+D")
        review_act.triggered.connect(self._open_daily_review)
        tools_menu.addAction(review_act)

        actions_act = QAction("📋  Chapter Actions", self)
        actions_act.triggered.connect(self._open_actions)
        tools_menu.addAction(actions_act)

        vocab_act = QAction("📖  Vocabulary", self)
        vocab_act.triggered.connect(self._open_vocab)
        tools_menu.addAction(vocab_act)

        stats_act = QAction("📊  Reading Stats", self)
        stats_act.triggered.connect(self._open_stats)
        tools_menu.addAction(stats_act)

        # Search shortcut
        search_action = QAction("Search...", self)
        search_action.setShortcut("Ctrl+F")
        search_action.triggered.connect(self._open_search)
        menubar.addAction(search_action)

    def show_library(self) -> None:
        self._save_progress()
        if hasattr(self, "library_screen"):
            self.library_screen.refresh_library()
        self.stack.setCurrentIndex(0)

    def _refresh_library(self) -> None:
        self.library_list.clear()
        for book in database.get_all_books():
            # Create a nicely formatted item
            title = book.title
            author = book.author or "Unknown author"
            fmt_icon = {"epub": "📕", "pdf": "📄", "txt": "📝"}.get(book.format, "📖")
            item = QListWidgetItem(f"{fmt_icon}  {title}\n      {author}")
            item.setData(256, book.id)
            item.setSizeHint(QSize(0, 52))
            self.library_list.addItem(item)
        if hasattr(self, "library_screen"):
            self.library_screen.refresh_library()

    def _refresh_highlights(self) -> None:
        self.highlights_list.clear()
        if not self.current_book:
            return
        for hl in database.get_highlights(self.current_book.id):
            preview = hl.text.replace("\n", " ")
            if len(preview) > 70:
                preview = preview[:70] + "..."
            color_dot = {"#FFF3B0": "🟡", "#B8E6C8": "🟢", "#B3D4FC": "🔵", "#F8BBD0": "🩷"}.get(hl.color, "●")
            item = QListWidgetItem(f"{color_dot}  {preview}  (p. {hl.page_index + 1})")
            item.setData(256, (hl.page_index, hl.start_pos, hl.id))
            self.highlights_list.addItem(item)

    def _jump_to_highlight(self, item: QListWidgetItem) -> None:
        data = item.data(256)
        if data is not None:
            if isinstance(data, tuple):
                page_idx, pos, _ = data
                self.reader.go_to_page_and_pos(page_idx, pos)
            else:
                self.reader.show_position(int(data))

    def _show_highlight_context_menu(self, pos) -> None:
        item = self.highlights_list.itemAt(pos)
        if not item:
            return
        data = item.data(256)
        if not data or not isinstance(data, tuple):
            return
        _, _, hl_id = data

        menu = QMenu(self.highlights_list)
        menu.setStyleSheet(f"""
            QMenu {{
                background: #2A2520;
                color: #E8DCC6;
                border: 1px solid rgba(196, 179, 138, 0.25);
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
                background: rgba(196, 179, 138, 0.18);
            }}
        """)
        delete_action = menu.addAction("🗑️  Delete Highlight")
        delete_action.triggered.connect(lambda: self._delete_highlight(hl_id))
        menu.exec(self.highlights_list.mapToGlobal(pos))

    def _delete_highlight(self, hl_id: int) -> None:
        database.delete_highlight(hl_id)
        self._refresh_highlights()
        if self.reader:
            self.reader._show_current_page()

    def _jump_to_word(self, item: QListWidgetItem) -> None:
        word = item.text().split("\n")[0]
        self.reader.show_word(word)

    def _refresh_vocabulary(self) -> None:
        self.vocabulary_list.clear()
        words = db_module.get_vocab()
        for w in words:
            word = w.get("word", "")
            definition = w.get("definition", "")
            item_text = f"📖  {word}\n      {definition[:55]}..." if len(definition) > 55 else f"📖  {word}\n      {definition}"
            item = QListWidgetItem(item_text)
            item.setData(256, w.get("id"))
            self.vocabulary_list.addItem(item)

    def _show_vocabulary_context_menu(self, pos) -> None:
        item = self.vocabulary_list.itemAt(pos)
        if not item:
            return
        vid = item.data(256)
        if not vid:
            return
        menu = QMenu(self.vocabulary_list)
        del_act = menu.addAction("🗑️  Delete Word")
        del_act.triggered.connect(lambda: self._delete_vocabulary(vid))
        menu.exec(self.vocabulary_list.mapToGlobal(pos))

    def _delete_vocabulary(self, vid: int) -> None:
        db_module.delete_vocab(vid)
        self._refresh_vocabulary()

    def _refresh_actions(self) -> None:
        if not hasattr(self, "actions_list"):
            return
        self.actions_list.clear()
        book_id = self.current_book.id if self.current_book else None
        actions = db_module.get_actions(book_id)
        for a in actions:
            done = bool(a.get("done"))
            icon = "☑" if done else "☐"
            txt = a.get("text", "")
            item = QListWidgetItem(f"{icon}  {txt}")
            item.setData(256, a.get("id"))
            item.setData(257, 1 if done else 0)
            if done:
                item.setForeground(QColor("#7A6F5E"))
            self.actions_list.addItem(item)

    def _on_action_item_clicked(self, item: QListWidgetItem) -> None:
        aid = item.data(256)
        done = item.data(257)
        if aid is not None:
            new_done = 0 if done else 1
            db_module.set_action_done(aid, new_done)
            self._refresh_actions()

    def open_book_dialog(self) -> None:
        path, _ = QFileDialog.getOpenFileName(
            self,
            "Open Book",
            "",
            "Books (*.epub *.txt *.pdf);;EPUB (*.epub);;PDF (*.pdf);;Text (*.txt)",
        )
        if path:
            self.open_book(path)

    def _open_selected_book(self, item: QListWidgetItem) -> None:
        book_id = item.data(256)
        book = database.get_book(book_id)
        if book:
            from pathlib import Path
            if not Path(book.file_path).is_file():
                QMessageBox.warning(
                    self,
                    "Book Not Found",
                    f"Could not find the book file at:\n{book.file_path}\n\nIf the file was renamed or moved, please open it using 'Add Book' to reconnect your reading progress.",
                )
                return
            self.open_book(book.file_path)

    def open_book(self, file_path: str) -> None:
        try:
            book, content = book_loader.load_book(file_path)
        except Exception as exc:
            QMessageBox.critical(self, "Error", f"Could not open book:\n{exc}")
            return

        self._save_progress()
        database.add_book(book)
        self.current_book = book
        self._refresh_library()

        # For EPUB, load chapter list for the WebEngine reader
        epub_chapters = None
        if book.format == "epub":
            try:
                _, epub_chapters = book_loader.load_epub_chapters(file_path)
            except Exception:
                epub_chapters = None

        is_html = (book.format == "epub")
        self.reader.load_content(
            book.id, content, is_html, book_format=book.format,
            file_path=book.file_path, epub_chapters=epub_chapters,
        )

        author = f"  —  {book.author}" if book.author else ""
        fmt_icon = {"epub": "📕", "pdf": "📄", "txt": "📝"}.get(book.format, "📖")
        self.book_title_label.setText(f"{fmt_icon}  {book.title}{author}")

        progress = database.get_progress(book.id)
        if progress and (progress.scroll_offset > 0 or progress.location):
            self.reader.restore_scroll(progress.scroll_offset)
            self.progress_label.setText("✦  RESUMED")
        else:
            self.progress_label.setText("")

        self._refresh_bookmarks()
        self._refresh_highlights()
        self._refresh_vocabulary()
        self._refresh_marks()
        self._refresh_actions()
        self._update_progress_ring()
        self.export_btn.setEnabled(True)
        self.search_btn.setEnabled(True)
        self.search_panel.set_current_book(book.id)

        # Kick off background indexing (skip if already indexed)
        self._start_indexing(book, epub_chapters)

        self.stack.setCurrentIndex(1)
        if hasattr(self, "library_screen"):
            self.library_screen.refresh_library()

    def _refresh_bookmarks(self) -> None:
        self.bookmarks_list.clear()
        if not self.current_book:
            return
        for bm in database.get_bookmarks(self.current_book.id):
            item = QListWidgetItem(f"🔖  {bm.title}")
            item.setData(256, (bm.page_index, bm.scroll_offset, bm.id))
            self.bookmarks_list.addItem(item)

    def _save_bookmark(self) -> None:
        if not self.current_book:
            return
        from core.models import Bookmark

        page_idx = self.reader.get_current_page_index()
        scroll_val = self.reader.get_current_scroll_val()
        snippet = self.reader.get_page_snippet()
        title = f"Page {page_idx + 1}: {snippet}" if snippet else f"Page {page_idx + 1}"

        bm = Bookmark(
            id=0,
            book_id=self.current_book.id,
            page_index=page_idx,
            scroll_offset=scroll_val,
            title=title,
        )
        database.add_bookmark(bm)
        self._refresh_bookmarks()
        self.progress_label.setText(f"✦  BOOKMARK SAVED (Page {page_idx + 1})")

    def _jump_to_bookmark(self, item: QListWidgetItem) -> None:
        data = item.data(256)
        if data is not None and isinstance(data, tuple):
            page_idx, scroll_offset, _ = data
            self.reader.go_to_page_and_scroll(page_idx, scroll_offset)
            self.progress_label.setText(f"✦  BOOKMARK RESTORED (Page {page_idx + 1})")

    def _show_bookmark_context_menu(self, pos) -> None:
        item = self.bookmarks_list.itemAt(pos)
        if not item:
            return
        data = item.data(256)
        if not data or not isinstance(data, tuple):
            return
        _, _, bm_id = data

        menu = QMenu(self.bookmarks_list)
        menu.setStyleSheet(f"""
            QMenu {{
                background: #2A2520;
                color: #E8DCC6;
                border: 1px solid rgba(196, 179, 138, 0.25);
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
                background: rgba(196, 179, 138, 0.18);
            }}
        """)
        delete_action = menu.addAction("🗑️  Delete Bookmark")
        delete_action.triggered.connect(lambda: self._delete_bookmark(bm_id))
        menu.exec(self.bookmarks_list.mapToGlobal(pos))

    def _delete_bookmark(self, bm_id: int) -> None:
        database.delete_bookmark(bm_id)
        self._refresh_bookmarks()

    def _save_progress(self) -> None:
        if not self.current_book:
            return
        # For EPUB, save position via the epub widget's own method
        if self.current_book.format == "epub":
            self.reader.save_epub_position()
            return
        from core.models import ReadingProgress

        database.save_progress(
            ReadingProgress(
                book_id=self.current_book.id,
                location="",
                scroll_offset=self.reader.get_scroll_offset(),
            )
        )

    def _export_marks_current_book(self) -> None:
        """Export all marks for the current book to a Markdown file."""
        if not self.current_book:
            return
        from core.marks_exporter import export_book_marks
        title = self.current_book.title or "book"
        safe_title = "".join(c for c in title if c.isalnum() or c in " _-").strip() or "marks"
        default_name = f"{safe_title}_marks.md"
        path, _ = QFileDialog.getSaveFileName(
            self, "Export Marks", default_name,
            "Markdown files (*.md);;All files (*.*)"
        )
        if not path:
            return
        try:
            count = export_book_marks(self.current_book, path)
            self.progress_label.setText(f"✦  EXPORTED {count} MARK{'S' if count != 1 else ''}")
        except Exception as exc:
            QMessageBox.critical(self, "Export Failed", f"Could not export marks:\n{exc}")

    # ── Search ──────────────────────────────────────────────────

    def _open_search(self) -> None:
        """Show the search panel (Ctrl+F)."""
        self.stack.setCurrentIndex(1)   # ensure we're on the reader screen
        self.search_btn.setChecked(True)
        self.search_panel.show_panel()

    def _toggle_search(self, checked: bool) -> None:
        if checked:
            self.search_panel.show_panel()
        else:
            self.search_panel.hide_panel()

    def _start_indexing(self, book: Book, epub_chapters: list[str] | None) -> None:
        """Launch IndexWorker in the background unless the book is already indexed."""
        if self._index_worker and self._index_worker.isRunning():
            self._index_worker.abort()
            self._index_worker.wait(200)

        if db_module.book_is_indexed(book.id):
            return   # already indexed

        self._index_worker = IndexWorker(
            book_id=book.id,
            file_path=book.file_path,
            book_format=book.format,
            epub_chapters=epub_chapters or [],
        )
        self._index_worker.progress.connect(self._on_index_progress)
        self._index_worker.finished.connect(self._on_index_finished)
        self._index_worker.no_text_warning.connect(self._on_no_text)
        self._index_worker.start()
        self.search_panel.show_index_progress(0, 1)

    def _on_index_progress(self, current: int, total: int) -> None:
        self.search_panel.show_index_progress(current, total)

    def _on_index_finished(self, success: bool, message: str) -> None:
        if success:
            self.search_panel.hide_index_progress(f"\u2726  {message}")
        else:
            self.search_panel.hide_index_progress()

    def _on_no_text(self) -> None:
        QMessageBox.warning(
            self,
            "No extractable text",
            "This book looks scanned. Search will not work on it.",
        )

    def _on_search_result(self, book_id: str, loc: str, fmt: str) -> None:
        """Navigate to the result. Opens the book first if it's a different one."""
        from pathlib import Path

        if not self.current_book or self.current_book.id != book_id:
            raw = db_module.get_book(book_id)
            if raw and raw.get("path") and Path(raw["path"]).is_file():
                self.open_book(raw["path"])
                QTimer.singleShot(800, lambda: self._navigate_to_loc(fmt, loc))
                return
            return

        self._navigate_to_loc(fmt, loc)
        self.search_panel.hide_panel()
        self.search_btn.setChecked(False)

    def _navigate_to_loc(self, fmt: str, loc: str) -> None:
        """Jump the reader to the given loc string."""
        try:
            idx = int(loc)
        except (ValueError, TypeError):
            return

        if fmt == "epub":
            self.reader.epub_widget.go_to_chapter(idx, 0.0)
        elif fmt == "pdf":
            self.reader.go_to_page_and_scroll(idx, 0)
        else:
            self.reader.go_to_page_and_scroll(idx, 0)

    # ── Marks (EPUB text marks) ───────────────────────────────────────

    def _refresh_marks(self) -> None:
        self.marks_list.clear()
        if not self.current_book:
            return
        for m in db_module.get_marks(self.current_book.id):
            quote = (m.get("quote", "") or "").replace("\n", " ")
            if len(quote) > 70:
                quote = quote[:70] + "..."
            color = m.get("color", "")
            color_dot = {
                "#FFF3B0": "🟡", "#B8E6C8": "🟢",
                "#B3D4FC": "🔵", "#F8BBD0": "🩷",
            }.get(color, "●")
            note = m.get("note", "")
            loc = m.get("loc", "")
            label = f"{color_dot}  {quote}"
            if note:
                label += f"\n      📝 {note[:40]}"
            item = QListWidgetItem(label)
            item.setData(256, m.get("id"))
            item.setData(257, loc)
            item.setSizeHint(QSize(0, 48 if not note else 58))
            self.marks_list.addItem(item)

    def _jump_to_mark(self, item: QListWidgetItem) -> None:
        loc = item.data(257)
        if not loc:
            return
        try:
            if "|" in str(loc):
                parts = str(loc).split("|", 1)
                idx = int(parts[0])
                scroll_y = float(parts[1])
            else:
                idx = int(loc)
                scroll_y = 0.0
            if self.current_book and self.current_book.format == "epub":
                self.reader.epub_widget.go_to_chapter(idx, scroll_y)
            else:
                self.reader.go_to_page_and_scroll(idx, int(scroll_y))
        except (ValueError, IndexError):
            pass

    def _show_mark_context_menu(self, pos) -> None:
        item = self.marks_list.itemAt(pos)
        if not item:
            return
        mark_id = item.data(256)
        if not mark_id:
            return

        from ui.mark_dialog import MarkDialog

        menu = QMenu(self.marks_list)
        menu.setStyleSheet(f"""
            QMenu {{
                background: #2A2520;
                color: #E8DCC6;
                border: 1px solid rgba(196, 179, 138, 0.25);
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
                background: rgba(196, 179, 138, 0.18);
            }}
        """)

        card_action = menu.addAction("🎨  Make quote card")
        card_action.triggered.connect(lambda: self._make_quote_card(mark_id))
        edit_action = menu.addAction("✏️  Edit Note")
        edit_action.triggered.connect(lambda: self._edit_mark(mark_id))
        delete_action = menu.addAction("🗑️  Delete Mark")
        delete_action.triggered.connect(lambda: self._delete_mark(mark_id))
        menu.exec(self.marks_list.mapToGlobal(pos))

    def _make_quote_card(self, mark_id: int) -> None:
        """Open the quote card preview dialog for this mark."""
        from ui.quote_card_dialog import QuoteCardDialog
        m = db_module.get_mark(mark_id)
        if not m:
            return
        quote = m.get("quote", "")
        if not quote:
            QMessageBox.information(self, "No Quote", "This mark does not have quote text.")
            return

        title = self.current_book.title if self.current_book else "Unknown Book"
        author = getattr(self.current_book, "author", "") if self.current_book else ""

        dlg = QuoteCardDialog(quote=quote, title=title, author=author, parent=self)
        dlg.exec()

    def _edit_mark(self, mark_id: int) -> None:
        from ui.mark_dialog import MarkDialog
        m = db_module.get_mark(mark_id)
        if not m:
            return
        dlg = MarkDialog(
            quote=m.get("quote", ""),
            note=m.get("note", ""),
            color=m.get("color", "#FFF3B0"),
            parent=self,
            is_edit=True,
        )
        if dlg.exec():
            quote, note, color = dlg.get_data()
            db_module.update_mark(mark_id, note=note, quote=quote, color=color)
            self._refresh_marks()
            # Re-render the current epub chapter to reflect updated highlights
            if self.current_book and self.current_book.format == "epub":
                self.reader.epub_widget._show_chapter()

    def _delete_mark(self, mark_id: int) -> None:
        db_module.delete_mark(mark_id)
        self._refresh_marks()
        # Re-render the current epub chapter to remove the deleted highlight
        if self.current_book and self.current_book.format == "epub":
            self.reader.epub_widget._show_chapter()

    def _restore_progress(self) -> None:
        if not self.current_book:
            return
        latest_bm = database.get_latest_bookmark(self.current_book.id)
        if latest_bm:
            self.reader.go_to_page_and_scroll(latest_bm.page_index, latest_bm.scroll_offset)
            self.progress_label.setText(f"✦  BOOKMARK RESTORED (Page {latest_bm.page_index + 1})")
        else:
            progress = database.get_progress(self.current_book.id)
            if progress:
                self.reader.restore_scroll(progress.scroll_offset)
                self.progress_label.setText("✦  POSITION RESTORED")
            else:
                self.progress_label.setText("No saved position")

    def closeEvent(self, event) -> None:
        self._save_progress()
        self._flush_session()
        super().closeEvent(event)

    def show_library(self) -> None:
        self._save_progress()
        self._flush_session()
        if hasattr(self, "library_screen"):
            self.library_screen.refresh_library()
        self.stack.setCurrentIndex(0)

    # ── Focus Mode & Themes & Stats Methods ───────────────────────────

    def keyPressEvent(self, event) -> None:
        if event.key() == Qt.Key.Key_F:
            self._toggle_focus_mode()
            event.accept()
            return
        elif event.key() == Qt.Key.Key_Escape and self._focus_mode:
            self._toggle_focus_mode()
            event.accept()
            return
        super().keyPressEvent(event)

    def eventFilter(self, obj, event) -> bool:
        if event.type() in (QEvent.Type.MouseMove, QEvent.Type.KeyPress, QEvent.Type.MouseButtonPress, QEvent.Type.Wheel):
            self._last_active_time = datetime.now()
        return super().eventFilter(obj, event)

    def _on_session_tick(self) -> None:
        if not self.current_book or not self.isActiveWindow() or self.stack.currentIndex() != 1:
            return

        idle_seconds = (datetime.now() - self._last_active_time).total_seconds()
        if idle_seconds <= 60:
            if self._session_start_time is None:
                self._session_start_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            self._session_active_seconds += 1

            if self._session_active_seconds >= 60:
                db_module.add_session(
                    book_id=self.current_book.id,
                    start=self._session_start_time,
                    seconds=self._session_active_seconds,
                )
                self._session_start_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                self._session_active_seconds = 0
                self._update_progress_ring()

        if self._focus_mode:
            self._update_focus_progress()

    def _flush_session(self) -> None:
        if self.current_book and self._session_active_seconds > 0 and self._session_start_time:
            db_module.add_session(
                book_id=self.current_book.id,
                start=self._session_start_time,
                seconds=self._session_active_seconds,
            )
            self._session_active_seconds = 0
            self._session_start_time = None

    def _toggle_focus_mode(self) -> None:
        if self.stack.currentIndex() != 1:
            return
        self._focus_mode = not self._focus_mode
        if self._focus_mode:
            self.menuBar().hide()
            self.left_sidebar.hide()
            self.reader_header.hide()
            self.focus_btn.setChecked(True)
            self._update_focus_progress()
            self.focus_progress_bar.show()
        else:
            self.menuBar().show()
            self.left_sidebar.show()
            self.reader_header.show()
            self.focus_btn.setChecked(False)
            self.focus_progress_bar.hide()

    def _update_focus_progress(self) -> None:
        if not self.current_book:
            return
        total = self.reader._total_pages
        cur = self.reader.get_current_page_index()
        if total > 0:
            pct = int(((cur + 1) / total) * 100)
            self.focus_progress_bar.setValue(pct)

    def _change_theme(self, theme: str) -> None:
        self.theme = theme
        settings_manager.set_setting("theme", theme)
        self.theme_btn.setText(f"🎨  {theme}")
        self.reader.set_theme(theme)

    def _font_size_up(self) -> None:
        self.font_size = min(36, self.font_size + 2)
        settings_manager.set_setting("font_size", self.font_size)
        self.reader.set_font_size(self.font_size)

    def _font_size_down(self) -> None:
        self.font_size = max(12, self.font_size - 2)
        settings_manager.set_setting("font_size", self.font_size)
        self.reader.set_font_size(self.font_size)

    def _update_progress_ring(self) -> None:
        today_key = datetime.now().strftime("%Y-%m-%d")
        today_secs = sum(s.get("seconds", 0) for s in db_module.get_sessions() if s.get("start", "")[:10] == today_key)
        today_secs += self._session_active_seconds
        goal = settings_manager.get_setting("daily_goal_minutes", 15)
        if hasattr(self, "reader_ring"):
            self.reader_ring.set_progress(today_secs / 60.0, goal)
        if hasattr(self, "library_screen"):
            self.library_screen.progress_ring.set_progress(today_secs / 60.0, goal)

    def _open_daily_review(self) -> None:
        dlg = ReviewDialog(self)
        dlg.review_completed.connect(self._refresh_library)
        dlg.exec()
        self._refresh_library()

    def _open_actions(self) -> None:
        dlg = ActionsListDialog(self)
        dlg.exec()
        self._refresh_actions()

    def _open_vocab(self) -> None:
        dlg = VocabularyListDialog(self)
        dlg.exec()
        self._refresh_vocabulary()

    def _open_stats(self) -> None:
        dlg = StatsDialog(self)
        dlg.goal_updated.connect(lambda _: self._update_progress_ring())
        dlg.exec()
        self._update_progress_ring()


def run() -> None:
    app = QApplication(sys.argv)
    app.setStyle("Fusion")

    # Apply dark palette for native dialogs
    palette = QPalette()
    palette.setColor(QPalette.ColorRole.Window, QColor(OUTER_BG))
    palette.setColor(QPalette.ColorRole.WindowText, QColor(SIDEBAR_TEXT))
    palette.setColor(QPalette.ColorRole.Base, QColor(SIDEBAR_BG))
    palette.setColor(QPalette.ColorRole.AlternateBase, QColor(SIDEBAR_DARKER))
    palette.setColor(QPalette.ColorRole.Text, QColor(SIDEBAR_TEXT))
    palette.setColor(QPalette.ColorRole.Button, QColor(HEADER_BG))
    palette.setColor(QPalette.ColorRole.ButtonText, QColor(SIDEBAR_TEXT))
    palette.setColor(QPalette.ColorRole.Highlight, QColor(SIDEBAR_ACCENT))
    palette.setColor(QPalette.ColorRole.HighlightedText, QColor("#1A1714"))
    app.setPalette(palette)

    app.setStyleSheet(APP_STYLESHEET)

    window = MainWindow()
    window.show()
    sys.exit(app.exec())
