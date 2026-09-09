import JSZip from 'jszip';

export interface EpubChapter {
  id: string;
  title: string;
  href: string;
  content: string; // Sanitized HTML
}

export interface ParsedEpub {
  title: string;
  author: string;
  chapters: EpubChapter[];
  totalChapters: number;
}

/**
 * Parses an EPUB file (ArrayBuffer or Blob), extracting metadata and spine chapters.
 * Scripts are stripped, and embedded images are replaced with offline Blob URLs.
 */
export async function parseEpub(data: Blob | ArrayBuffer): Promise<ParsedEpub> {
  const buffer = data instanceof Blob ? await data.arrayBuffer() : data;
  const zip = await JSZip.loadAsync(buffer);

  // 1. Find rootfile from META-INF/container.xml
  const containerFile = zip.file('META-INF/container.xml');
  if (!containerFile) {
    throw new Error('Invalid EPUB: META-INF/container.xml missing');
  }

  const containerXml = await containerFile.async('text');
  const parser = new DOMParser();
  const containerDoc = parser.parseFromString(containerXml, 'application/xml');
  const rootfileEl = containerDoc.querySelector('rootfile');
  const opfPath = rootfileEl?.getAttribute('full-path');

  if (!opfPath) {
    throw new Error('Invalid EPUB: Rootfile not found in container.xml');
  }

  // 2. Parse OPF
  const opfFile = zip.file(opfPath);
  if (!opfFile) {
    throw new Error(`Invalid EPUB: OPF file not found at ${opfPath}`);
  }

  const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
  const opfXml = await opfFile.async('text');
  const opfDoc = parser.parseFromString(opfXml, 'application/xml');

  // Metadata
  const titleEl = opfDoc.querySelector('metadata > title, metadata > dc\\:title');
  const title = titleEl?.textContent?.trim() || 'Untitled Book';

  const authorEl = opfDoc.querySelector('metadata > creator, metadata > dc\\:creator');
  const author = authorEl?.textContent?.trim() || '';

  // Manifest
  const manifestItems = new Map<string, { href: string; mediaType: string }>();
  const itemEls = opfDoc.querySelectorAll('manifest > item');
  itemEls.forEach((el) => {
    const id = el.getAttribute('id');
    const href = el.getAttribute('href');
    const mediaType = el.getAttribute('media-type') || '';
    if (id && href) {
      // Decode URI components in href
      manifestItems.set(id, { href: decodeURIComponent(href), mediaType });
    }
  });

  // Spine
  const spineItemrefs = opfDoc.querySelectorAll('spine > itemref');
  const chapterRefs: string[] = [];
  spineItemrefs.forEach((ref) => {
    const idref = ref.getAttribute('idref');
    if (idref && manifestItems.has(idref)) {
      chapterRefs.push(idref);
    }
  });

  // Extract assets cache (images) to create offline object URLs
  const assetBlobUrls = new Map<string, string>();
  for (const [_, item] of manifestItems.entries()) {
    if (item.mediaType.startsWith('image/')) {
      const fullPath = resolveRelativePath(opfDir, item.href);
      const file = zip.file(fullPath);
      if (file) {
        const imgBlob = await file.async('blob');
        const objectUrl = URL.createObjectURL(imgBlob);
        assetBlobUrls.set(item.href, objectUrl);
        // Also map just basename
        const baseName = item.href.split('/').pop();
        if (baseName) assetBlobUrls.set(baseName, objectUrl);
      }
    }
  }

  // 3. Process chapters in spine order
  const chapters: EpubChapter[] = [];

  for (let i = 0; i < chapterRefs.length; i++) {
    const id = chapterRefs[i];
    const manifestItem = manifestItems.get(id);
    if (!manifestItem) continue;

    const chapterPath = resolveRelativePath(opfDir, manifestItem.href);
    const chapterFile = zip.file(chapterPath);
    if (!chapterFile) continue;

    const rawHtml = await chapterFile.async('text');
    const chapterDoc = parser.parseFromString(rawHtml, 'text/html');

    // Remove any and all script tags for security
    const scripts = chapterDoc.querySelectorAll('script');
    scripts.forEach((s) => s.remove());

    // Clean inline event handlers
    const allElements = chapterDoc.querySelectorAll('*');
    allElements.forEach((el) => {
      const attrs = el.getAttributeNames();
      for (const attr of attrs) {
        if (attr.toLowerCase().startsWith('on')) {
          el.removeAttribute(attr);
        }
      }
    });

    // Replace images with cached offline Blob URLs
    const images = chapterDoc.querySelectorAll('img, image');
    images.forEach((img) => {
      const src = img.getAttribute('src') || img.getAttribute('xlink:href');
      if (src) {
        const decodedSrc = decodeURIComponent(src);
        const resolvedBlobUrl =
          assetBlobUrls.get(decodedSrc) ||
          assetBlobUrls.get(decodedSrc.split('/').pop() || '') ||
          assetBlobUrls.get(resolveRelativePath(chapterPath.slice(0, chapterPath.lastIndexOf('/') + 1), decodedSrc));
        if (resolvedBlobUrl) {
          img.setAttribute('src', resolvedBlobUrl);
        }
      }
    });

    // Extract chapter title
    const hEl = chapterDoc.querySelector('h1, h2, h3, title');
    const chapterTitle = hEl?.textContent?.trim() || `Chapter ${i + 1}`;

    const bodyEl = chapterDoc.body;
    const cleanContent = bodyEl ? bodyEl.innerHTML : chapterDoc.documentElement.innerHTML;

    chapters.push({
      id,
      title: chapterTitle,
      href: manifestItem.href,
      content: cleanContent,
    });
  }

  return {
    title,
    author,
    chapters,
    totalChapters: chapters.length,
  };
}

function resolveRelativePath(baseDir: string, relativePath: string): string {
  const stack = baseDir.split('/').filter(Boolean);
  const parts = relativePath.split('/');

  for (const part of parts) {
    if (part === '.') continue;
    if (part === '..') {
      stack.pop();
    } else {
      stack.push(part);
    }
  }

  return stack.join('/');
}
