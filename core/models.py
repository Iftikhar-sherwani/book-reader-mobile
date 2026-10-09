from dataclasses import dataclass


@dataclass
class Book:
    id: str
    title: str
    author: str
    file_path: str
    format: str  # "epub", "txt", or "pdf"


@dataclass
class ReadingProgress:
    book_id: str
    location: str
    scroll_offset: int


@dataclass
class Highlight:
    id: int
    book_id: str
    start_pos: int
    end_pos: int
    color: str
    text: str
    page_index: int = 0



@dataclass
class SavedWord:
    id: int
    book_id: str
    word: str
    context: str
    note: str


@dataclass
class Bookmark:
    id: int
    book_id: str
    page_index: int
    scroll_offset: int
    title: str = ""
    created_at: str = ""

