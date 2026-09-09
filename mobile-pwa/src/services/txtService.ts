export interface ParsedTxt {
  title: string;
  pages: string[];
  totalPageCount: number;
}

const CHARS_PER_PAGE = 2500;

export async function parseTxt(fileOrBlob: Blob | File, filename?: string): Promise<ParsedTxt> {
  const text = await fileOrBlob.text();
  const cleanTitle = (filename || 'Document').replace(/\.txt$/i, '');

  if (!text || text.trim().length === 0) {
    return {
      title: cleanTitle,
      pages: ['(Empty text file)'],
      totalPageCount: 1,
    };
  }

  // Split into readable pages preserving paragraphs
  const paragraphs = text.split(/\r?\n\r?\n/);
  const pages: string[] = [];
  let currentPage = '';

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    if (currentPage.length + trimmed.length > CHARS_PER_PAGE && currentPage.length > 0) {
      pages.push(currentPage.trim());
      currentPage = trimmed;
    } else {
      currentPage += (currentPage ? '\n\n' : '') + trimmed;
    }
  }

  if (currentPage.trim().length > 0) {
    pages.push(currentPage.trim());
  }

  return {
    title: cleanTitle,
    pages: pages.length > 0 ? pages : [text],
    totalPageCount: Math.max(1, pages.length),
  };
}
