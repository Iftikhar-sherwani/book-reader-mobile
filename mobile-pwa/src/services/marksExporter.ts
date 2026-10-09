import type { Book, Mark } from '../types';

const COLOR_NAMES: Record<string, string> = {
  '#FFF3B0': '🟡 Yellow',
  '#B8E6C8': '🟢 Green',
  '#B3D4FC': '🔵 Blue',
  '#F8BBD0': '🩷 Pink',
};

function formatLoc(loc: string, format: string): string {
  if (format === 'epub') {
    const parts = loc.split('|');
    const ch = parts[0] || '1';
    return `[Chapter ${ch} | EPUB]`;
  } else if (format === 'pdf') {
    return `[Page ${loc} | PDF]`;
  }
  return `[Section ${loc} | TXT]`;
}

function renderBookMarkdown(book: Book, marks: Mark[]): string {
  const lines: string[] = [];
  lines.push(`# ${book.title}`);
  if (book.author) {
    lines.push(`*${book.author}*`);
  }
  lines.push('');
  lines.push(`*Exported ${new Date().toLocaleDateString()} · ${marks.length} mark${marks.length !== 1 ? 's' : ''}*`);
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const m of marks) {
    const cleanQuote = m.quote.trim().split('\n').map((l) => `> ${l}`).join('\n');
    lines.push(cleanQuote);
    if (m.note) {
      lines.push(`📝 ${m.note}`);
    }
    const locTag = formatLoc(m.loc, book.format);
    const colorTag = COLOR_NAMES[m.color] || '● Highlight';
    lines.push(`\`${locTag}  ·  ${colorTag}\``);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

function triggerDownload(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportBookMarks(book: Book, marks: Mark[]): void {
  const md = renderBookMarkdown(book, marks);
  const safeTitle = (book.title || 'book').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
  triggerDownload(`${safeTitle}_marks.md`, md);
}

export function exportAllBooksMarks(books: Book[], allMarks: Mark[]): void {
  const bookMap = new Map(books.map((b) => [b.id, b]));
  const marksByBook = new Map<string, Mark[]>();

  for (const m of allMarks) {
    const list = marksByBook.get(m.bookId) || [];
    list.push(m);
    marksByBook.set(m.bookId, list);
  }

  const sections: string[] = [];
  sections.push('# All Book Marks & Highlights');
  sections.push(`*Exported ${new Date().toLocaleDateString()} · Total ${allMarks.length} marks across ${marksByBook.size} books*`);
  sections.push('');
  sections.push('====================================================');
  sections.push('');

  for (const [bookId, marks] of marksByBook.entries()) {
    const book = bookMap.get(bookId) || {
      id: bookId,
      title: 'Unknown Book',
      author: '',
      format: 'epub' as const,
      fileSize: 0,
      addedAt: 0,
      lastOpenedAt: 0,
      pageCount: 1,
    };
    sections.push(renderBookMarkdown(book, marks));
    sections.push('\n\n');
  }

  triggerDownload('All_Book_Marks.md', sections.join('\n'));
}
